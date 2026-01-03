/**
 * resultDb.js — Database utilities for Result and ExportJob persistence
 *
 * Provides clean abstractions for:
 * - Saving generated results (out_envelope) by resultId
 * - Querying results by ID
 * - Creating export jobs
 * - Querying/updating export job status
 *
 * Built on top of Prisma Client.
 */

let prisma = null;
let prismaInitializationError = null;

/**
 * Lazy-initialize Prisma Client
 * This allows tests to mock the client before it's instantiated.
 * If initialization fails, cache the error so we fail fast on all subsequent calls.
 */
function getPrisma() {
  // If we already failed to initialize, throw cached error (fail fast)
  if (prismaInitializationError) {
    throw prismaInitializationError;
  }

  if (prisma) return prisma;

  try {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
    return prisma;
  } catch (error) {
    // Cache the error so subsequent calls fail fast instead of retrying
    prismaInitializationError = new Error(
      `Prisma initialization failed: ${error.message}\n` +
        'Make sure to run "npx prisma generate" and restart the server (kill & restart node process).\n' +
        "If you just ran prisma generate, the running server process has a stale module cache. Restart it."
    );
    throw prismaInitializationError;
  }
}

/**
 * Reset Prisma initialization state (used for testing or manual recovery)
 */
function resetPrisma() {
  prisma = null;
  prismaInitializationError = null;
}

async function saveResult(resultId, outEnvelope, mode, promptId = null) {
  if (!resultId || !outEnvelope || !mode) {
    const err = new Error("resultId, outEnvelope, and mode are required");
    err.status = 400;
    throw err;
  }

  try {
    const result = await getPrisma().result.create({
      data: {
        resultId,
        outEnvelope,
        mode,
        promptId,
      },
    });
    return result;
  } catch (error) {
    console.error("saveResult failed:", error.message);
    const err = new Error(`Failed to save result: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Retrieve a result by resultId
 * @param {string} resultId - UUID of the result
 * @returns {Promise<Object|null>} Result record with outEnvelope
 */
async function getResultById(resultId) {
  if (!resultId) {
    const err = new Error("resultId is required");
    err.status = 400;
    throw err;
  }

  try {
    const result = await getPrisma().result.findUnique({
      where: { resultId },
    });
    return result;
  } catch (error) {
    console.error("getResultById failed:", error.message);
    const err = new Error(`Failed to retrieve result: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Create an export job for a result
 * @param {string} jobId - UUID for the job
 * @param {string} resultId - UUID of the result to export
 * @returns {Promise<Object>} Created export job record
 */
async function createExportJob(jobId, resultId) {
  if (!jobId || !resultId) {
    const err = new Error("jobId and resultId are required");
    err.status = 400;
    throw err;
  }

  // Verify result exists
  const result = await getResultById(resultId);
  if (!result) {
    const err = new Error("Result not found");
    err.status = 404;
    throw err;
  }

  try {
    const job = await getPrisma().exportJob.create({
      data: {
        jobId,
        resultId,
        status: "queued",
      },
    });
    return job;
  } catch (error) {
    console.error("createExportJob failed:", error.message);
    const err = new Error(`Failed to create export job: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Get export job by jobId
 * @param {string} jobId - UUID of the job
 * @returns {Promise<Object|null>} Export job record
 */
async function getExportJobById(jobId) {
  if (!jobId) {
    const err = new Error("jobId is required");
    err.status = 400;
    throw err;
  }

  try {
    const job = await getPrisma().exportJob.findUnique({
      where: { jobId },
      include: { result: true },
    });
    return job;
  } catch (error) {
    console.error("getExportJobById failed:", error.message);
    const err = new Error(`Failed to retrieve export job: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Update export job status
 * @param {string} jobId - UUID of the job
 * @param {Object} updates - Fields to update { status, progress, pdfPath, errorMessage, completedAt }
 * @returns {Promise<Object>} Updated export job record
 */
async function updateExportJob(jobId, updates) {
  if (!jobId) {
    const err = new Error("jobId is required");
    err.status = 400;
    throw err;
  }

  try {
    const job = await getPrisma().exportJob.update({
      where: { jobId },
      data: updates,
    });
    return job;
  } catch (error) {
    console.error("updateExportJob failed:", error.message);
    const err = new Error(`Failed to update export job: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Get all queued export jobs
 * @returns {Promise<Array>} Array of queued jobs
 */
async function getQueuedExportJobs(limit = 10) {
  try {
    const jobs = await getPrisma().exportJob.findMany({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: { result: true },
    });
    return jobs;
  } catch (error) {
    console.error("getQueuedExportJobs failed:", error.message);
    const err = new Error(`Failed to retrieve queued jobs: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Delete expired export jobs (older than maxAgeMs)
 * @param {number} maxAgeMs - Age threshold in milliseconds (default: 24 hours)
 * @returns {Promise<number>} Number of deleted jobs
 */
async function deleteExpiredExportJobs(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const result = await getPrisma().exportJob.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });
    console.log(
      `Deleted ${
        result.count
      } expired export jobs older than ${cutoff.toISOString()}`
    );
    return result.count;
  } catch (error) {
    console.error("deleteExpiredExportJobs failed:", error.message);
    const err = new Error(`Failed to delete expired jobs: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Get export job statistics (counts by status)
 * @returns {Promise<Object>} Counts by status: { queued, processing, complete, failed }
 */
async function getExportJobStats() {
  try {
    const stats = await getPrisma().exportJob.groupBy({
      by: ["status"],
      _count: true,
    });

    const counts = {
      queued: 0,
      processing: 0,
      complete: 0,
      failed: 0,
    };

    for (const stat of stats) {
      if (counts.hasOwnProperty(stat.status)) {
        counts[stat.status] = stat._count;
      }
    }

    return counts;
  } catch (error) {
    console.error("getExportJobStats failed:", error.message);
    const err = new Error(
      `Failed to retrieve job statistics: ${error.message}`
    );
    err.status = 500;
    throw err;
  }
}

/**
 * Get export jobs by status with optional filters
 * @param {string} status - Job status to filter by
 * @param {Object} filters - Additional filters { olderThan, limit }
 * @returns {Promise<Array>} Array of export jobs
 */
async function getExportJobsByStatus(status, filters = {}) {
  try {
    const where = { status };

    if (filters.olderThan) {
      where.createdAt = { lt: filters.olderThan };
    }

    const jobs = await getPrisma().exportJob.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: filters.limit || 1000,
    });

    return jobs;
  } catch (error) {
    console.error("getExportJobsByStatus failed:", error.message);
    const err = new Error(`Failed to retrieve export jobs: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

/**
 * Mark expired jobs (older than maxAgeMs) as "expired" status without deleting
 * Useful for cleanup tracking and compliance audits
 * @param {number} maxAgeMs - Age threshold in milliseconds (default: 24 hours)
 * @returns {Promise<number>} Number of jobs marked as expired
 */
async function markJobsAsExpired(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const cutoff = new Date(Date.now() - maxAgeMs);

    const result = await getPrisma().exportJob.updateMany({
      where: {
        createdAt: { lt: cutoff },
        status: { not: "expired" },
      },
      data: {
        status: "expired",
      },
    });

    console.log(
      `Marked ${
        result.count
      } jobs as expired (older than ${cutoff.toISOString()})`
    );
    return result.count;
  } catch (error) {
    console.error("markJobsAsExpired failed:", error.message);
    const err = new Error(`Failed to mark jobs as expired: ${error.message}`);
    err.status = 500;
    throw err;
  }
}

module.exports = {
  saveResult,
  getResultById,
  createExportJob,
  getExportJobById,
  updateExportJob,
  getQueuedExportJobs,
  deleteExpiredExportJobs,
  getExportJobStats,
  getExportJobsByStatus,
  markJobsAsExpired,
  // Test/debug helpers
  resetPrisma,
  getPrisma,
};
