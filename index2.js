const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Функция для безопасного преобразования имени папки
function sanitizeFolderName(name) {
    return name.replace(/[<>:"/\\|?*\s]+/g, ' '); // Заменяем недопустимые символы и пробелы на " "
}

// Функция для создания безопасного имени файла
function sanitizeFileName(url) {
    // Удаляем пробелы в начале и конце строки и кодируем специальные символы
    const sanitizedUrl = decodeURIComponent(url.trim());

    // Используем улучшенное регулярное выражение для извлечения цифр после символов `--`
    const match = sanitizedUrl.match(/--(\d+)\s*$/);

    // Если найдено совпадение, возвращаем только цифры, иначе возвращаем unknown_name
    return match ? match[1] : 'unknown_name';
}

// Функция для парсинга продукта
async function scrapeProduct(url, region) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    const delay_page = 50000; // Время ожидания полной загрузки страницы (50 секунд)
    const delay_button = 30000; // Время ожидания отображения и полной отрисовки кнопки "Москва и область"
    const delay_region = 10000; // Время ожидания исчезновения окна выбора региона после клика
    const delay_bottom = 3000; // Время ожидания прогрузки "дна" страницы
    const delay_top = 1000; // Время ожидания прогрузки "верха" страницы
    console.log(`Требуемый регион = ${region}`);

    // Блокируем уведомления
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(url, []);

    await page.setViewport({ width: 1200, height: 800 });

    console.log('Открываем страницу...');
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        console.log('Страница загружена.');
    } catch (error) {
        console.error('Ошибка загрузки страницы:', error.message);
        await browser.close();
        return;
    }

    console.log('Ожидание отображения кнопки "Москва и область"...');

    try {
        // Ожидание, пока кнопка "Москва и область" станет видимой
        await page.waitForSelector('.Region_region__6OUBn', {
            visible: true,
            timeout: delay_button,
        });
        console.log('Кнопка "Москва и область" видима.');

        // Ожидание полной отрисовки интерфейса кнопки
        await page.waitForFunction(
            () => {
                const button = document.querySelector('.Region_region__6OUBn');
                if (!button) return false;

                const style = window.getComputedStyle(button);
                return style.opacity === '1' && style.visibility === 'visible';
            },
            { timeout: delay_button }
        );

        console.log('Интерфейс кнопки "Москва и область" полностью отображен.');
    } catch (error) {
        console.error('Ошибка:', error.message);
        await browser.close();
        return;
    }

    // Проверка региона и выполнения действий по выбору региона
    const currentRegion = await page.evaluate(() => {
        const regionElement = document.querySelector(
            '.UiHeaderHorizontalBase_region__2ODCG > div > span:nth-child(2)'
        );
        if (!regionElement) {
            console.log('Элемент не найден');
            return null;
        }

        console.log(`regionElement найден: ${regionElement.outerHTML}`);
        return regionElement.textContent.trim();
    });

    console.log(`Текущий регион = ${currentRegion}`);

    if (region.trim() !== currentRegion?.trim()) {
        console.log('Регион отличается. Выполняем действия...');

        // Выполняем клик по кнопке "Москва и область"
        console.log('Выполняем клик по кнопке "Москва и область"...');
        let isClickSuccessful = false;
        let retries = 20; // Максимальное количество попыток для клика
        const delay = 2000; // Задержка между попытками в миллисекундах
        const delay2 = 2000; // Время ожидания для появления и видимости элемента на странице
        while (retries > 0 && !isClickSuccessful) {
            try {
                await page.click('.Region_region__6OUBn');
                console.log('Попытка клика по кнопке "Москва и область"...');
                await page.waitForSelector('.UiRegionListBase_list__cH0fK', {
                    visible: true,
                    timeout: delay2,
                });
                console.log('Клик прошёл. Экран выбора региона появился.');
                isClickSuccessful = true;
            } catch (error) {
                console.warn(
                    `Не удалось выполнить клик по кнопке "Москва и область" или экран выбора региона не появился. Предупреждение: ${error.message}`
                );
                console.log('Повторная попытка клика...');
                await new Promise((resolve) => setTimeout(resolve, delay));
                retries--;
            }
        }

        if (!isClickSuccessful) {
            console.error(
                'Ошибка: экран выбора региона все равно не появился после нескольких попыток.'
            );
            await browser.close();
            return;
        }

        console.log('Выбираем регион...');
        try {
            const success = await page.evaluate((region) => {
                const regionItems = document.querySelectorAll(
                    '.UiRegionListBase_item___ly_A'
                );
                const targetRegion = Array.from(regionItems).find((item) =>
                    item.textContent.includes(region)
                );
                if (targetRegion) {
                    targetRegion.click();
                    return true;
                }
                return false;
            }, region);

            if (!success) {
                console.error('Ошибка: Регион не найден.');
                await browser.close();
                return;
            }

            await page.waitForFunction(
                () => !document.querySelector('.UiRegionListBase_list__cH0fK'),
                { timeout: delay_region }
            );
            console.log('Регион успешно выбран.');
        } catch (error) {
            console.error('Ошибка при выборе региона:', error);
            await browser.close();
            return;
        }
    } else {
        console.log('Регион уже установлен.');
    }

    console.log(
        'Скрываем элементы Войдите в X5ID, Согласие cookie, Всплывающая полоса и добавляем наблюдатель на изменения...'
    );

    await page.evaluate(() => {
        // Функция для скрытия элементов
        const hideElement = (selector) => {
            const element = document.querySelector(selector);
            if (element) {
                element.style.display = 'none';
            }
        };

        // Функции для скрытия конкретных элементов
        const hideTooltip = () =>
            hideElement('.Tooltip_root__EMk_3.Tooltip_whiteTheme__bkjSb');
        const hideBottomPortal = () =>
            hideElement('.FeatureAppLayoutBase_bottomPortal__VvIPN');
        const hideStickyBar = () =>
            hideElement(
                '.StickyPortal_root__5NZsr.StickyPortal_showing__TqUwE'
            );

        // Скрываем элементы сразу
        hideTooltip();
        hideBottomPortal();
        hideStickyBar();

        // Создаем MutationObserver для отслеживания изменений в DOM
        const observer = new MutationObserver(() => {
            hideTooltip();
            hideBottomPortal();
            hideStickyBar();
        });

        // Настраиваем MutationObserver на отслеживание изменений в дочерних элементах и добавленных узлах
        observer.observe(document.body, { childList: true, subtree: true });

        console.log(
            'Наблюдатель установлен для постоянного скрытия элементов.'
        );
    });

    console.log('Ожидание полной загрузки страницы...');
    try {
        await page.waitForFunction(() => document.readyState === 'complete', {
            timeout: delay_page,
        });
        console.log('Страница полностью загружена.');
    } catch (error) {
        console.warn(
            `Внимание: не удалось дождаться полной загрузки страницы по тайм-ауту. Продолжаем... Предупреждение: ${error.message}`
        );
    }

    console.log('Прокрутка страницы до "дна"...');
    try {
        await page.evaluate(async () => {
            await new Promise((resolve, reject) => {
                const distance = 100; // Расстояние прокрутки за один шаг
                let totalHeight = 0; // Общая высота прокрутки
                let attempts = 0; // Счётчик попыток без изменений

                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;

                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    // Если достигнут конец страницы или высота не изменяется более 5 раз
                    if (totalHeight >= scrollHeight) {
                        attempts++;
                    } else {
                        attempts = 0; // Сбросить попытки при изменении высоты
                    }

                    // Проверяем, достигли ли мы конца страницы или произошла ошибка
                    if (attempts > 5) {
                        console.log(
                            'Достигнут конец страницы или прокрутка заблокирована.'
                        );
                        clearInterval(timer);
                        resolve();
                    }

                    if (attempts > 10) {
                        // Если попыток стало слишком много
                        clearInterval(timer);
                        reject(
                            new Error(
                                'Прокрутка заблокирована, и количество попыток превышено.'
                            )
                        );
                    }
                }, 150); // Увеличенное время для эмуляции реального пользователя
            });
        });
        console.log('Прокрутка завершена.');
    } catch (error) {
        console.error('Ошибка при прокрутке страницы:', error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, delay_bottom));

    console.log('Прокрутка страницы наверх...');
    await page.evaluate(async () => {
        const scrollToTop = () => {
            const scrollStep = window.scrollY / 20; // Разделяем на 20 шагов для плавности
            if (window.scrollY > 0) {
                window.scrollBy(0, -scrollStep);
                requestAnimationFrame(scrollToTop); // Рекурсивно вызываем до полного скролла наверх
            }
        };

        scrollToTop();
    });

    await new Promise((resolve) => setTimeout(resolve, delay_top));

    // Создание папки для текущего региона, если её не существует
    const sanitizedRegion = sanitizeFolderName(region); // Используем безопасное имя папки
    const regionFolder = path.join(__dirname, sanitizedRegion);
    if (!fs.existsSync(regionFolder)) {
        fs.mkdirSync(regionFolder);
    }

    // Создание имени файла скриншота и product.txt на основе URL
    const sanitizedUrlName = sanitizeFileName(url); // Используем функцию для безопасного имени файла
    const screenshotPath = path.join(
        regionFolder,
        `screenshot_${sanitizedUrlName}.jpg`
    );
    const productFilePath = path.join(
        regionFolder,
        `product_${sanitizedUrlName}.txt`
    );

    // Сохранение скриншота в соответствующую папку
    console.log(`Делаем скриншот страницы для региона "${region}"...`);
    try {
        // Добавляем небольшую задержку перед скриншотом для стабилизации страницы
        await new Promise((resolve) => setTimeout(resolve, 500)); // 500 миллисекунд
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(
            '\x1b[32m%s\x1b[0m',
            `Скриншот страницы успешно сделан и сохранен как ${screenshotPath}.`
        );
    } catch (error) {
        await browser.close();
        console.error('Ошибка при создании скриншота:', error.message);
    }

    console.log('Извлекаем данные о товаре...');
    const productData = await page.evaluate(() => {
        // Поиск элемента со скидочной ценой
        const discountPriceElement = document.querySelector(
            '.Price_price__QzA8L.Price_size_XL__MHvC1.Price_role_discount__l_tpE'
        );
        // Поиск элемента со старой ценой
        const priceOldElement = document.querySelector(
            '.Price_price__QzA8L.Price_size_XS__ESEhJ.Price_role_old__r1uT1'
        );
        // Поиск элемента с обычной ценой (если нет скидки)
        const regularPriceElement = document.querySelector(
            '.Price_price__QzA8L.Price_size_XL__MHvC1.Price_role_regular__X6X4D'
        );
        const ratingElement = document.querySelector(
            '.ActionsRow_stars__EKt42'
        );
        const reviewCountElement = document.querySelector(
            '.ActionsRow_reviews__AfSj_'
        );

        // Извлечение цены
        let price = null;
        if (discountPriceElement) {
            price = discountPriceElement.textContent
                .replace(/\s/g, '') // Удаляем все пробелы в строке
                .replace(',', '.') // Заменяем запятую на точку
                .replace(/[^\d.]/g, ''); // Удаляем все символы, кроме цифр и точки
        } else if (regularPriceElement) {
            // Обработка регулярной цены, если скидка отсутствует
            const wholePart =
                regularPriceElement.childNodes[0].textContent.trim();

            // Проверка на наличие элемента с дробной частью
            const fractionElement = regularPriceElement.querySelector(
                '.Price_fraction__lcfu_'
            );
            const fractionalPart = fractionElement
                ? fractionElement.textContent
                      .replace(/\s/g, '')
                      .replace(',', '.')
                      .replace(/[^\d.]/g, '')
                : ''; // Если элемент не найден, установить дробную часть как пустую строку

            price = `${wholePart}${fractionalPart}`;
        }

        // Извлечение старой цены
        const priceOld = priceOldElement
            ? priceOldElement.textContent
                  .replace(/\s/g, '')
                  .replace(',', '.')
                  .replace(/[^\d.]/g, '')
            : null;

        // Извлечение рейтинга
        const rating = ratingElement
            ? ratingElement.title.split(': ')[1].trim().replace(',', '.')
            : null;

        // Извлечение количества отзывов
        const reviewCount = reviewCountElement
            ? reviewCountElement.textContent
                  .replace(/\s/g, '')
                  .replace(',', '.')
                  .replace(/[^\d.]/g, '')
            : null;

        return { price, priceOld, rating, reviewCount };
    });

    console.log('Данные о товаре извлечены:', productData);

    console.log('Сохраняем данные в файл product.txt...');
    try {
        // Создание строки с данными о продукте
        let productInfo = `
price=${productData.price}
priceOld=${productData.priceOld}
rating=${productData.rating}
reviewCount=${productData.reviewCount}
                `;

        // Запись данных в файл
        fs.writeFileSync(productFilePath, productInfo.trim());
        console.log(
            '\x1b[32m%s\x1b[0m',
            `Данные успешно сохранены в файл ${productFilePath}.`
        );
    } catch (error) {
        console.error(
            'Ошибка при сохранении данных в файл product.txt:',
            error.message
        );
    }

    console.log('Закрытие браузера...');
    try {
        await browser.close();
        console.log('Браузер успешно закрыт.');
    } catch (error) {
        console.error('Ошибка при закрытии браузера:', error.message);
    }
}

// Чтение URL и регионов из файлов и запуск скрипта для каждого сочетания
const urls = fs.readFileSync('url.txt', 'utf-8').split('\n').filter(Boolean);
const regions = fs
    .readFileSync('region.txt', 'utf-8')
    .split('\n')
    .filter(Boolean);

if (!urls.length || !regions.length) {
    console.error(
        'Пожалуйста, убедитесь, что файлы url.txt и region.txt не пусты и содержат данные.'
    );
    process.exit(1);
}

// Запуск парсинга для каждого региона и URL
(async () => {
    for (const region of regions) {
        const regionStr = String(region).trim(); // Преобразуем region в строку и убираем пробелы

        for (const url of urls) {
            await scrapeProduct(url, regionStr); // Передаем строку в функцию
        }
    }
})();
