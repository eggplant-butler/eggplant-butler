const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { execSync } = require('child_process');

const DATA_DIR = process.env.RAILWAY_ENVIRONMENT
  ? '/tmp/data'
  : path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(__dirname, '..', 'backup');

// 确保备份目录存在
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// 执行备份
function performBackup() {
  try {
    ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `eggplant-butler-backup-${timestamp}.zip`;
    const backupPath = path.join(BACKUP_DIR, backupName);

    // 使用zip命令压缩（如果系统有zip）
    try {
      execSync(`cd "${DATA_DIR}" && zip -r "${backupPath}" .`);
      console.log(`[备份] 备份完成: ${backupName}`);
    } catch (zipErr) {
      // 如果没有zip，用tar.gz
      const tarName = backupName.replace('.zip', '.tar.gz');
      const tarPath = path.join(BACKUP_DIR, tarName);
      try {
        execSync(`cd "${DATA_DIR}" && tar -czf "${tarPath}" .`);
        console.log(`[备份] 备份完成: ${tarName}`);
      } catch (tarErr) {
        // 如果都没有，直接复制文件
        const copyDir = path.join(BACKUP_DIR, `backup-${timestamp}`);
        fs.mkdirSync(copyDir, { recursive: true });
        const files = fs.readdirSync(DATA_DIR);
        files.forEach(file => {
          const src = path.join(DATA_DIR, file);
          const dest = path.join(copyDir, file);
          if (fs.statSync(src).isFile()) {
            fs.copyFileSync(src, dest);
          }
        });
        console.log(`[备份] 备份完成（文件复制方式）: ${copyDir}`);
      }
    }

    // 清理旧备份（保留最近10个）
    cleanupOldBackups(10);

    return { success: true, backupPath };
  } catch (err) {
    console.error('[备份] 备份失败:', err.message);
    return { success: false, error: err.message };
  }
}

// 清理旧备份
function cleanupOldBackups(keepCount = 10) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('eggplant-butler-backup') || f.startsWith('backup-'))
      .sort()
      .reverse();

    if (files.length > keepCount) {
      const toDelete = files.slice(keepCount);
      toDelete.forEach(file => {
        const filePath = path.join(BACKUP_DIR, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(filePath);
          }
          console.log(`[备份] 已删除旧备份: ${file}`);
        } catch (e) {
          console.error(`[备份] 删除旧备份失败 ${file}:`, e.message);
        }
      });
    }
  } catch (err) {
    console.error('[备份] 清理旧备份失败:', err.message);
  }
}

// 初始化定时备份（每天凌晨3点）
function initBackupScheduler() {
  ensureBackupDir();

  // 每天 03:00 执行
  schedule.scheduleJob('0 3 * * *', () => {
    console.log('[备份] 开始执行每日定时备份...');
    performBackup();
  });

  console.log('[备份] 定时备份已初始化（每日03:00）');
}

// 获取备份列表
function getBackupList() {
  ensureBackupDir();
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .map(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stat = fs.statSync(filePath);
        return {
          name: file,
          size: stat.size,
          created: stat.birthtime || stat.mtime,
          isDirectory: stat.isDirectory()
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    return files;
  } catch (err) {
    console.error('[备份] 获取列表失败:', err.message);
    return [];
  }
}

module.exports = {
  performBackup,
  initBackupScheduler,
  getBackupList,
  cleanupOldBackups
};
