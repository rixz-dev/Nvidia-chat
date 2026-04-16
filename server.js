const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Izinkan akses dari frontend (meski satu origin)
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // Sajikan file statis dari folder public

// Endpoint chat proxy
app.post('/api/chat', async (req, res) => {
    const { model, messages, temperature, top_p, max_tokens, stream, tools, tool_choice, chat_template_kwargs } = req.body;

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
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

    try {
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
            console.error('NVIDIA API error:', response.status, errorText);
            return res.status(response.status).json({ error: `NVIDIA API error: ${response.status}` });
        }

        if (requestBody.stream) {
            // Streaming response: teruskan chunk per chunk
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = response.body;
            reader.on('data', (chunk) => {
                res.write(chunk);
            });
            reader.on('end', () => {
                res.end();
            });
            reader.on('error', (err) => {
                console.error('Stream error:', err);
                res.end();
            });
        } else {
            // Non-streaming (fallback)
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server proxy.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server berjalan di http://localhost:${PORT}`);
});
