const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3000;
let activeProcesses = {};

const server = http.createServer((req, res) => {
    // Serve static files
    if (req.method === 'GET') {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        filePath = path.join(__dirname, 'public', filePath);
        
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
            } else {
                let ext = path.extname(filePath);
                let contentType = 'text/html';
                if (ext === '.css') contentType = 'text/css';
                if (ext === '.js') contentType = 'text/javascript';
                
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
        return;
    }

    // API to execute AI CLI
    if (req.method === 'POST' && req.url === '/api/run') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const data = JSON.parse(body);
            const { id, agent, prompt, projectPath, isDemo } = data;

            res.writeHead(200, { 'Content-Type': 'application/json' });

            if (isDemo) {
                setTimeout(() => {
                    res.end(JSON.stringify({ status: 'done', output: `[DEMO] ${agent} ทำงานเสร็จแล้ว! นี่คือตัวอย่างคำตอบสำหรับ: ${prompt}` }));
                }, 2000);
                return;
            }

            // Real CLI Execution (Windows requires .cmd for npm globals if shell:false)
            const cmd = agent === 'claude' ? 'claude.cmd' : 'antigravity.cmd';
            const args = ['-p', prompt]; // เปลี่ยน argument ตรงนี้ได้ถ้า CLI ตัวจริงใช้คำสั่งอื่น

            try {
                // ตรวจสอบว่าโฟลเดอร์มีจริงไหม
                if (!fs.existsSync(projectPath)) {
                    res.end(JSON.stringify({ status: 'error', output: `ไม่พบโฟลเดอร์โปรเจกต์: ${projectPath}` }));
                    return;
                }

                const child = spawn(cmd, args, { cwd: projectPath, shell: false });
                activeProcesses[id] = child;
                
                let outputStr = '';
                child.stdout.on('data', (data) => outputStr += data.toString());
                child.stderr.on('data', (data) => outputStr += `[Error/Log]: ${data.toString()}`);

                child.on('close', (code) => {
                    delete activeProcesses[id];
                    if (code === 0) {
                        res.end(JSON.stringify({ status: 'done', output: outputStr || 'ทำงานสำเร็จ (ไม่มี Output)' }));
                    } else {
                        // ถ้า exit code ไม่ใช่ 0 หรือขึ้นให้ล็อกอิน
                        const status = outputStr.toLowerCase().includes('login') ? 'needs_setup' : 'error';
                        res.end(JSON.stringify({ status, output: `Exit ${code}: ${outputStr}` }));
                    }
                });

                child.on('error', (err) => {
                    delete activeProcesses[id];
                    res.end(JSON.stringify({ status: 'error', output: `โปรดตรวจสอบว่าติดตั้ง ${agent} แล้ว: ${err.message}` }));
                });

            } catch (err) {
                res.end(JSON.stringify({ status: 'error', output: err.message }));
            }
        });
        return;
    }

    // API to Stop Process
    if (req.method === 'POST' && req.url === '/api/stop') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const { id } = JSON.parse(body);
            if (activeProcesses[id]) {
                activeProcesses[id].kill();
                delete activeProcesses[id];
                res.writeHead(200);
                res.end(JSON.stringify({ status: 'cancelled', output: 'หยุดการทำงานแล้ว' }));
            } else {
                res.writeHead(400);
                res.end(JSON.stringify({ status: 'error', output: 'ไม่พบโปรเซส' }));
            }
        });
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 Mini Dev Studio เปิดใช้งานแล้วที่ http://localhost:${PORT}`);
});