const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

// Используем плагин stealth
puppeteer.use(StealthPlugin());

async function scrapeProduct(url, region) {
    const browser = await puppeteer.launch({
        headless: true, // Остаемся в headless режиме
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    // Установка пользовательского агента и других настроек может помочь
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36'
    );

    await page.setViewport({ width: 1280, height: 720 });

    const delay_page = 90000; // Время ожидания (в миллисекундах) для полной загрузки страницы (90 секунд)
    const delay_button = 30000; // Время ожидания (в миллисекундах) для отображения и полной отрисовки кнопки "Москва и область" (30 секунд)
    const delay_region = 10000; // Время ожидания (в миллисекундах) для исчезновения окна выбора региона после клика (10 секунд)
    const delay_bottom = 3000; // Время ожидания прогрузки "дна" страницы
    const delay_top = 2000; // Время ожидания прогрузки "верха" страницы
    console.log(`Требуемый регион = ${region}`);

    // Блокируем уведомления
    const context = browser.defaultBrowserContext();
    await context.overridePermissions(url, []);

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

    if (region !== currentRegion) {
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
        console.log('Выбор региона не требуется.');
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

    console.log('Делаем скриншот страницы...');
    try {
        // Скрываем ненужные элементы или настраиваем элементы на странице
        await page.evaluate(() => {
            document
                .querySelectorAll('.footer, .popup, .cookie-consent')
                .forEach((el) => el.remove());
        });

        // Добавляем задержку для стабилизации страницы
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Задержка 2 секунды

        // Устанавливаем viewport в зависимости от содержания
        const bodyHandle = await page.$('body');
        const boundingBox = await bodyHandle.boundingBox();
        await page.setViewport({
            width: Math.ceil(boundingBox.width),
            height: Math.ceil(boundingBox.height),
        });
        await bodyHandle.dispose();

        // Сделать скриншот
        await page.screenshot({ path: 'screenshot.jpg', fullPage: true });
        console.log(
            '\x1b[32m%s\x1b[0m',
            'Скриншот страницы успешно сделан и сохранен как screenshot.jpg.'
        );
    } catch (error) {
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
        const productInfo = `
price=${productData.price}
priceOld=${productData.priceOld}
rating=${productData.rating}
reviewCount=${productData.reviewCount}
        `;

        fs.writeFileSync('product.txt', productInfo.trim());
        console.log(
            '\x1b[32m%s\x1b[0m',
            `Данные успешно сохранены в файл product.txt.`
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

const args = process.argv.slice(2);
const url = args[0];
const region = args[1];

if (!url || !region) {
    console.error('Пожалуйста предоставьте URL и регион как аргументы.');
    process.exit(1);
}

scrapeProduct(url, region).catch(console.error);
