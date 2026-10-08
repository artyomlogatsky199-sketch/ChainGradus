import http from 'http';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const ipRequests = new Map();
const chatMessages = []; 

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
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`CyberServer запущен на порту ${PORT}`));
