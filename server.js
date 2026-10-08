import http from 'http';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const ipRequests = new Map();
const chatMessages = []; 

// Массив для хранения перехваченных постов канала
let telegramPosts = [
    { id: 1, date: "Система", text: "Ожидание новых публикаций из канала 👁‍🗨Градус&Град🕐...", link: "https://t.me" }
];

// ТОКЕН ВАШЕГО БОТА
const BOT_TOKEN = '8906638177:AAGh0m80wJ4QynITzskSRitUHR5R2l46_HQ';
let lastUpdateId = 0;

const clean = (val) => String(val || '').replace(/[<>]/g, '').trim().substring(0, 100);

const checkDdos = (ip) => {
    const now = Date.now();
    if (!ipRequests.has(ip)) ipRequests.set(ip, []);
    const times = ipRequests.get(ip).filter(t => now - t < 60000);
    times.push(now);
    ipRequests.set(ip, times);
    return times.length > 80;
};

const sendJson = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

// Функция циклического парсинга постов через Telegram Long Polling
const fetchTelegramUpdates = async () => {
    try {
        const url = `https://telegram.org{BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`; //
        const response = await fetch(url);
        const data = await response.json();

        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id; //

                // Проверяем, пришел ли пост из канала (channel_post)
                if (update.channel_post) {
                    const post = update.channel_post;
                    const text = post.text || post.caption || "[Медиафайл]";
                    const date = new Date(post.date * 1000).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                    
                    // Формируем прямую ссылку на пост, если у канала есть юзернейм, иначе даем общую инвайт-ссылку
                    const channelName = post.chat.username ? post.chat.username : 'c/xxxxxxxxx';
                    const postLink = `https://t.me{channelName}/${post.message_id}`;

                    // Добавляем в начало списка постов сайта
                    telegramPosts.unshift({ id: post.message_id, date, text, link: postLink });

                    // Ограничиваем кэш ленты до 20 постов
                    if (telegramPosts.length > 20) telegramPosts.pop();
                }
            }
        }
    } catch (err) {
        console.error("Ошибка парсинга ТГ:", err.message);
    }
    // Запускаем следующий опрос мгновенно после завершения текущего
    setTimeout(fetchTelegramUpdates, 2000);
};

// Запуск фонового парсера ТГ-канала
fetchTelegramUpdates();

const server = http.createServer((req, res) => {
    const clientIp = req.socket.remoteAddress;
    if (checkDdos(clientIp)) return sendJson(res, 429, { error: 'Слишком много запросов.' });

    if (req.method === 'GET') {
        const safeUrl = req.url === '/' ? '/index.html' : req.url.split('?')[0];
        const filePath = path.join(__dirname, 'public', safeUrl);

        if (!filePath.startsWith(path.join(__dirname, 'public'))) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            return res.end('Access Denied');
        }

        const ext = path.extname(filePath);
        const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
                res.end(content);
            }
        });
    } 
    
    else if (req.method === 'POST') {
        // Эндпоинт отправки сообщений в Чат
        if (req.url === '/api/chat') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const text = clean(data.text);
                    const user = clean(data.nickname);

                    if (!text || !user) return sendJson(res, 400, { error: 'Пустое сообщение' });

                    const msg = { id: Date.now(), nickname: user, text, time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) };
                    chatMessages.push(msg);
                    if (chatMessages.length > 50) chatMessages.shift();

                    sendJson(res, 200, { success: true, messages: chatMessages });
                } catch {
                    sendJson(res, 400, { error: 'Ошибка сервера' });
                }
            });
        }
        // Эндпоинт получения постов ТГ на фронтенд
        else if (req.url === '/api/get-posts') {
            sendJson(res, 200, { success: true, posts: telegramPosts });
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`CyberServer запущен на порту ${PORT}`));
