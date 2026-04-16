const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Logging request
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Chat proxy endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const {
            model,
            messages,
            temperature,
            top_p,
            max_tokens,
            stream,
            tools,
            tool_choice,
            chat_template_kwargs
        } = req.body;

        const apiKey = process.env.NVIDIA_API_KEY;
        if (!apiKey) {
            console.error('❌ NVIDIA_API_KEY tidak diset di environment.');
            return res.status(500).json({ error: 'API key tidak dikonfigurasi di server.' });
        }

        const requestBody = {
            model: model || 'deepseek-ai/deepseek-v3.2',
            messages,
            temperature: temperature ?? 1,
            top_p: top_p ?? 0.95,
            max_tokens: max_tokens ?? 8192,
            stream: stream ?? true,
            ...(tools && { tools, tool_choice: tool_choice || 'auto' }),
            ...(chat_template_kwargs && { chat_template_kwargs }),
        };

        console.log(`📤 Mengirim request ke NVIDIA API (model: ${requestBody.model})`);

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ NVIDIA API error ${response.status}:`, errorText);
            return res.status(response.status).json({
                error: `NVIDIA API error: ${response.status} - ${errorText.substring(0, 200)}`
            });
        }

        if (requestBody.stream) {
            // Streaming response (Server-Sent Events)
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            response.body.on('data', (chunk) => {
                res.write(chunk);
            });

            response.body.on('end', () => {
                res.end();
            });

            response.body.on('error', (err) => {
                console.error('❌ Stream error:', err);
                res.end();
            });
        } else {
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server proxy.' });
    }
});

// Fallback untuk route yang tidak ditemukan (tetap JSON untuk API, HTML untuk lainnya)
app.use((req, res) => {
    if (req.url.startsWith('/api/')) {
        res.status(404).json({ error: 'Endpoint tidak ditemukan' });
    } else {
        res.status(404).sendFile('public/404.html', { root: __dirname });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
