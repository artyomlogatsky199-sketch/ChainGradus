import http from 'http';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const ipRequests = new Map();
const chatMessages = []; 

// Хранилище временных кодов для входа
const authSessions = new Map(); 

const BOT_TOKEN = '8906638177:AAGh0m80wJ4QynITzskSRitUHR5R2l46_HQ';

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

// Фоновый опрос команд для бота (Ловит команду /start от юзеров)
let lastUpdateId = 0;
const listenBotCommands = async () => {
    try {
        const response = await fetch(`https://telegram.org{BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`);
        const data = await response.json();
        if (data.ok && data.result.length > 0) {
            for (const update of data.result) {
                lastUpdateId = update.update_id;
                if (update.message && update.message.text) {
                    const text = update.message.text;
                    const chatId = update.message.chat.id;
                    const from = update.message.from;

                    // Если пользователь пришел с сайта с кодом авторизации
                    if (text.startsWith('/start auth_')) {
                        const authCode = text.split('_')[1];
                        
                        // Сохраняем реальные данные человека из Telegram в сессию
                        authSessions.set(authCode, {
                            first_name: from.first_name || 'Странник',
                            last_name: from.last_name || '',
                            username: from.username || 'no_user',
                            photo_url: `https://dicebear.com{from.id}`
                        });

                        // Отправляем сообщение человеку в Telegram
                        await fetch(`https://telegram.org{BOT_TOKEN}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: chatId,
                                text: `⚡ Авторизация успешна! Возвращайтесь на сайт, система автоматически впустит вас в обитель.`
                            })
                        });
                    }
                }
            }
        }
    } catch (e) {}
    setTimeout(listenBotCommands, 1000);
};
listenBotCommands();

const server = http.createServer((req, res) => {
    const clientIp = req.socket.remoteAddress;
    if (checkDdos(clientIp)) return sendJson(res, 429, { error: 'Слишком много запросов.' });

    // Раздача файлов
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
        // Проверка статуса авторизации (Браузер постоянно спрашивает: "Ну что, юзер нажал старт в боте?")
        if (req.url === '/api/check-auth') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const { code } = JSON.parse(body);
                if (authSessions.has(code)) {
                    const userData = authSessions.get(code);
                    authSessions.delete(code); // Очищаем временный код
                    return sendJson(res, 200, { success: true, user: userData });
                }
                sendJson(res, 200, { success: false });
            });
        }
        
        // Отправка сообщений в Чат
        else if (req.url === '/api/chat') {
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
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`CyberServer запущен на порту ${PORT}`));
