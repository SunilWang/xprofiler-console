'use strict';

const Service = require('egg').Service;

class OverviewService extends Service {
  getStatus(data) {
    if (data < 60) {
      return 1;
    } else if (data < 85) {
      return 2;
    }
    return 3;
  }

  comparePidsInAgent(log, key) {
    let maxPid;
    let maxData;
    for (const [pid, { [key]: data }] of Object.entries(log)) {
      if (!maxPid) {
        maxPid = pid;
        maxData = data;
        continue;
      }
      if (data > maxData) {
        maxPid = pid;
        maxData = data;
      }
    }
    return { maxPid, maxData };
  }

  async getLatestProcessData(appId, agentId) {
    const { ctx: { service: { process, manager } } } = this;

    // get pids
    let list = await process.getDataByPeriod(appId, agentId, 3);
    const pids = Array.from(new Set(list.map(item => item.pid)));
    if (!pids.length) {
      return;
    }

    // check process is alive
    const avlivePids = manager.handleXtransitResponse(await manager.checkProcessessAvlie(appId, agentId, pids));
    list = list.filter(item => avlivePids[item.pid]);
    const latestPidMap = {};
    list.forEach(item => {
      const { pid, log_time } = item;
      if (!latestPidMap[pid]) {
        latestPidMap[pid] = item;
      } else {
        if (new Date(log_time).getTime() > new Date(latestPidMap[pid].log_time).getTime()) {
          latestPidMap[pid] = item;
        }
      }
    });

    Object.entries(latestPidMap).forEach(([, log]) => (log.heap_used_percent = log.heap_used / log.heap_limit * 100));

    return latestPidMap;
  }

  setMemoryUsage(log) {
    const { total_memory, free_memory } = log;
    log.used_memory = total_memory - free_memory;
    log.used_memory_percent = log.used_memory / total_memory;
  }

  setMaxDisk(log) {
    const { ctx } = this;
    try {
      const disks = JSON.parse(log.disks);
      let maxDisk;
      let maxDiskUsage = 0;
      for (const [disk, usage] of Object.entries(disks)) {
        if (!maxDisk) {
          maxDisk = disk;
          maxDiskUsage = usage;
          continue;
        }
        if (usage > maxDiskUsage) {
          maxDisk = disk;
          maxDiskUsage = usage;
        }
      }
      log.max_disk = maxDisk;
      log.max_disk_usage = maxDiskUsage;
    } catch (err) {
      ctx.logger.error(`setMaxDisk parse disks failed: ${err}, raw: ${log.disks}`);
    }
  }

  async getLatestSystemData(appId, agentId) {
    const { ctx: { service: { system } } } = this;

    const list = await system.getDataByPeriod(appId, agentId, 3);
    if (!list.length) {
      return;
    }

    const log = list[0];
    // system memory
    this.setMemoryUsage(log);
    // disk usage
    this.setMaxDisk(log);

    return log;
  }
}

module.exports = OverviewService;
