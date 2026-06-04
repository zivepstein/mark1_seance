// this is claude's conversion of answerai's claudette
// https://github.com/AnswerDotAI/claudette/

import Anthropic from '@anthropic-ai/sdk';

class Usage {
    inputTokens = 0;
    outputTokens = 0;

    constructor(inputTokens = 0, outputTokens = 0) {
        this.inputTokens = inputTokens;
        this.outputTokens = outputTokens;
    }

    get total() {
        return this.inputTokens + this.outputTokens;
    }

    toString = () => `In: ${this.inputTokens}; Out: ${this.outputTokens}; Total: ${this.total}`;

    add = (other) => new Usage(this.inputTokens + other.inputTokens, this.outputTokens + other.outputTokens);
}

const mkMsg = ({ content, role = 'user' } = {}) => {
    content = Array.isArray(content) ? content : [content];
    content = content.map(item => typeof item === 'string' ? { type: 'text', text: item } : item);
    return { role, content };
};

const mkMsgs = (msgs) => (Array.isArray(msgs) ? msgs : [msgs])
    .map((msg, i) => mkMsg({ content: msg, role: i % 2 === 0 ? 'user' : 'assistant' }));

class Client {
    use = new Usage();

    constructor(apiKey, model = 'claude-3-5-sonnet-20240620') {
        this.model = model;
        this.anthropic = new Anthropic({ apiKey });
    }

    async call(msgs, { sp = '', temp = 0, maxTokens = 4096, stream = false, prefill = '', images = [] } = {}) {
        msgs = mkMsgs(msgs);

        // Add image content to the first user message
        if (images.length > 0 && msgs[0].role === 'user') {
            msgs[0].content = [
                ...images.map(img => ({
                    type: 'image',
                    source: {
                        type: 'base64',
                        media_type: img.media_type,
                        data: img.data,
                    },
                })),
                ...msgs[0].content,
            ];
        }

        const params = {
            model: this.model,
            messages: msgs,
            max_tokens: maxTokens,
            temperature: temp,
            system: sp,
        };

        if (prefill) {
            params.messages.push(mkMsg({ content: prefill, role: 'assistant' }));
        }

        if (stream) {
            return this.anthropic.messages.stream(params);
        }

        const response = await this.anthropic.messages.create(params);
        this.result = response;
        this.use = this.use.add(new Usage(response.usage.input_tokens, response.usage.output_tokens));

        if (prefill) {
            response.content[0].text = prefill + response.content[0].text;
        }

        return response;
    }
}

class Chat {
    h = [];

    constructor(apiKey, model = 'claude-3-5-sonnet-20240620', sp = '') {
        this.c = new Client(apiKey, model);
        this.sp = sp;
    }

    get use() {
        return this.c.use;
    }

    async call(pr = null, { temp = 0, maxTokens = 4096, stream = false, prefill = '', images = [] } = {}) {
        if (pr && this.h.length > 0 && this.h[this.h.length - 1].role === 'user') {
            await this.call();
        }
        pr && this.h.push(mkMsg({ content: pr }));

        const result = await this.c.call(this.h, { sp: this.sp, temp, maxTokens, stream, prefill, images });

        if (!stream) {
            this.h.push(mkMsg({ content: result.content, role: 'assistant' }));
        }

        return result;
    }
}


export {Chat, Client};
// example:
// const chat = new Chat('claude-3-opus-20240229', 'your-api-key-here');

// Non-streaming example with prefill
// chat.call('Hello, Claude!', 0, 4096, false, 'The weather today is ').then(response => console.log(response));

// Example usage with an image:
// const chat = new Chat('your-api-key-here');
// const imageData = 'base64_encoded_image_data';
// chat.call('Describe this image', { 
//     images: [{ media_type: 'image/jpeg', data: imageData }] 
// }).then(response => console.log(response));