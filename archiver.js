const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Функция для архивации папки
function archiveFolder(folderPath, outputFilePath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outputFilePath);
        const archive = archiver('zip', {
            zlib: { level: 9 } // Уровень сжатия
        });

        output.on('close', function () {
            console.log(`Архив создан для ${folderPath}. Размер: ${archive.pointer()} байт.`);
            resolve();
        });

        output.on('end', function () {
            console.log('Данные потока были завершены.');
        });

        archive.on('warning', function (err) {
            if (err.code === 'ENOENT') {
                console.warn('Архиватор предупреждает:', err);
            } else {
                reject(err);
            }
        });

        archive.on('error', function (err) {
            reject(err);
        });

        archive.pipe(output);
        archive.directory(folderPath, path.basename(folderPath));
        archive.finalize();
    });
}

// Получить все папки в текущем каталоге, кроме node_modules и temps
function getFoldersToArchive(basePath) {
    return fs.readdirSync(basePath).filter((file) => {
        const fullPath = path.join(basePath, file);
        return fs.statSync(fullPath).isDirectory() && !['node_modules', 'temps'].includes(file);
    });
}

// Основная функция
async function archiveAllFolders() {
    const basePath = __dirname; // Текущий каталог
    const folders = getFoldersToArchive(basePath);

    for (const folder of folders) {
        const folderPath = path.join(basePath, folder);
        const outputArchive = path.join(basePath, `${folder}.zip`);

        try {
            await archiveFolder(folderPath, outputArchive);
        } catch (err) {
            console.error(`Ошибка при архивации папки ${folderPath}:`, err.message);
        }
    }

    console.log('Архивация завершена.');
}

// Запуск архивации
archiveAllFolders();
