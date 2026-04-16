// api/chat.js
// Vercel serverless function untuk proxy NVIDIA API

export default async function handler(req, res) {
    // Hanya izinkan metode POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.NVIDIA_API_KEY;
    if (!apiKey) {
        console.error('❌ NVIDIA_API_KEY tidak diset di environment Vercel.');
        return res.status(500).json({ error: 'API key tidak dikonfigurasi di server.' });
    }

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

        console.log(`📤 Forwarding request to NVIDIA API (model: ${requestBody.model})`);

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

            // Teruskan stream dari NVIDIA ke client
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(decoder.decode(value));
            }
            res.end();
        } else {
            const data = await response.json();
            res.status(200).json(data);
        }
    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan pada server proxy.' });
    }
}
