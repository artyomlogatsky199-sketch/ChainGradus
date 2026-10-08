import http from 'http';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const users = new Map();
const ipRequests = new Map();

// Хелперы безопасности
const clean = (val) => String(val || '').replace(/[<>]/g, '').trim().substring(0, 50);

const checkDdos = (ip) => {
    const now = Date.now();
    if (!ipRequests.has(ip)) ipRequests.set(ip, []);
    const timestamps = ipRequests.get(ip).filter(t => now - t < 60000); // 1 минута
    timestamps.push(now);
    ipRequests.set(ip, timestamps);
    return timestamps.length > 60; // Лимит: 60 запросов в минуту
};

const sendJson = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
};

// Сервер
const server = http.createServer((req, res) => {
    const clientIp = req.socket.remoteAddress;

    if (checkDdos(clientIp)) {
        return sendJson(res, 429, { error: 'Too many requests. Сбавьте скорость!' });
    }

    if (req.method === 'GET') {
        const safeUrl = req.url === '/' ? '/index.html' : req.url;
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
    
    else if (req.method === 'POST' && req.url === '/api/register') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                const nick = clean(parsed.nickname);
                const tg = clean(parsed.telegram);

                if (!nick || !tg) return sendJson(res, 400, { error: 'Заполните поля!' });
                if (users.has(nick)) return sendJson(res, 400, { error: 'Ник уже занят' });

                const user = {
                    nickname: nick,
                    telegram: tg,
                    avatar: `https://dicebear.com{encodeURIComponent(nick)}`
                };
                users.set(nick, user);
                sendJson(res, 200, { success: true, user });
            } catch {
                sendJson(res, 400, { error: 'Ошибка обработки данных' });
            }
        });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`CyberServer запущен на порту ${PORT}`);
});
