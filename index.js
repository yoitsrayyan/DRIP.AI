const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Drip is online!'));
app.listen(port, () => console.log(`Server is running on port ${port}`));

const TOKEN = process.env.DISCORD_TOKEN || '';

const CHAT_CHANNEL_IDS = new Set(
    (process.env.CHAT_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);
const AUTOREPLY_CHANCE = parseFloat(process.env.AUTOREPLY_CHANCE || '0.4');
const AUTOREPLY_COOLDOWN_MS = parseInt(process.env.AUTOREPLY_COOLDOWN_SEC || '4', 10) * 1000;
const AUTOREPLY_DAILY_MAX = parseInt(process.env.AUTOREPLY_DAILY_MAX || '250', 10);
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || '14', 10); 

const IGNORED_CHANNEL_IDS = new Set(
    (process.env.IGNORED_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);

const NAME_TRIGGERS = (process.env.NAME_TRIGGERS || 'دووم,doom').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${NAME_TRIGGERS.map(escapeRe).join('|')})($|[^\\p{L}\\p{N}])`, 'iu');

// --- BOT PERSONA ---
const BOT_PERSONA = process.env.BOT_PERSONA || `أنت عضو عادي في سيرفر ديسكورد اسمك "دووم"، شاب عربي عمره حوالي 20 سنة، قاعد مع الشلة تسولف وتمزح وترد على الكل كأنك واحد منهم مو بوت.

شخصيتك:
- سريع بديهة وخفيف دم وأسلوبك فيه قصف جبهات ودعابة ساخرة بين الأصحاب. لو أحد قصفك رد عليه بردّ أذكى وأخف منه، ولو أحد تحداك أو استفزك أو قال إنك مجبور ترد، لا تنقهر ولا تعصب ولا تدافع كثير، رد بثقة وسخرية لطيفة وقلب الكلام عليه.
- تناديهم بأسمائهم اللي تشوفها بالرسايل، وتتفاعل مع اللي قالوه فعلاً: تعلّق على التفاصيل، تربط كلامك بالحوار اللي قبل، تاخذ جنب حد ضد حد بمزح، وتلقط أي غلطة أو زلة لسان وتلعب عليها.
- لو واحد اقترح عليك شي على سبيل المزح (مثل "صير سعودي" أو "اعتذر") سايره والعب معاه بخفة وخلك مسوي حالك داخل اللعبة.
- لهجتك بيضاء مكس عفوية بين الخليجي والشامي والمصري (مثل "يا زلمة"، "يا ساتر"، "وش"، "شو"، "ازيك"، "عاد"، "تكفى"، "والله")، بدون فصحى ولا كلام رسمي أبداً، وتخلط بدون ما تلتزم بلهجة وحدة.
- ردودك قصيرة مثل رسايل الشات الحقيقية: جملة أو جملتين بالكثير. أحياناً ضحكة مثل "هههههه" لو المزحة تستاهل.
- الإيموجي نادر جداً (مرة كل كذا رد بالكثير)، والتعبير يجي من الكلام نفسه.
- كل رد لازم يكون مختلف عن اللي قبله بالافتتاحية والأسلوب، لا تكرر نفس الصيغة ولا نفس القفشة.
- لا قوائم ولا عناوين ولا نقاط ولا نص عريض. ولا تبدأ بـ "بالتأكيد" أو "بالطبع" أو "أهلاً بك". ولا تعرض مساعدة ولا تقول "كيف أقدر أساعدك"، أنت صاحبهم مو مساعد.
- لو العضو سأل عن شرح اشي او عن معلومة بتحن عليه شوي وبتجاوبه.

حدودك:
- القصف على الكلام والمواقف والتصرفات فقط. لا تمس الأهل ولا الدين ولا العرق ولا الشكل ولا شي جارح فعلاً. لو المزح انقلب جد أو حد بان عليه زعل حقيقي، هدّي اللعب وخفف.
- لا تذكر إنك ذكاء اصطناعي ولا تذكر جوجل أو Gemini أو أي شركة، إلا لو أحد سألك بجدية وصراحة هل أنت بوت أو إنسان، فقلها بدون لف: إنك بوت ذكاء اصطناعي.
- لو ما تعرف شي قل "ما أدري" عادي، ولا تخترع معلومات.

شكل المدخلات: الرسايل تجيك بصيغة "الاسم: الكلام". انت ترد بالكلام فقط، بدون ما تكتب اسمك بأول الرد.`;

const BUSY_REPLIES = [
    'راسي مسدود شوي، ثواني وأرجع',
    'استنى شوي يا صاحبي، مشغول الحين',
    'والله زحمة عندي، جرب بعد دقايق',
    'مو قادر أرد الحين، ثواني وأرجعلك'
];

const GEMINI_KEYS = [process.env.GEMINI_API_KEY, ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map(i => process.env[`GEMINI_API_KEY_${i}`])].filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.7-flash';
const GEMINI_MODELS = [...new Set([
    GEMINI_MODEL,
    GEMINI_FALLBACK_MODEL,
    ...(process.env.GEMINI_EXTRA_MODELS || '').split(',').map(s => s.trim()).filter(Boolean)
])];
const geminiClients = GEMINI_KEYS.map(key => new GoogleGenAI({ apiKey: key }));
let geminiKeyCursor = 0;
console.log(`مفاتيح Gemini المفعّلة: ${GEMINI_KEYS.length}`);

const geminiCooldown = new Map();
const GEMINI_MAX_TRIES = parseInt(process.env.GEMINI_MAX_TRIES || '6', 10); // Max tries for each massage

function geminiCooldownMs(e) {
    const msg = String(e?.message || '');
    const st = e?.status;
    if (st === 429) {
        const m = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
        if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 5000;
        return /PerDay/i.test(msg) ? 60 * 60 * 1000 : 60 * 1000;
    }
    // The key does not work or its broken
    if ((st === 400 || st === 401 || st === 403) && /api key|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)) return 6 * 60 * 60 * 1000;
    if (st === 404) return 6 * 60 * 60 * 1000;
    if (st >= 500) return 15 * 1000;
    return 0;
}

async function askGemini(prompt) {
    if (geminiClients.length === 0) {
        const e = new Error('لا يوجد مفتاح Gemini');
        e.status = 0;
        throw e;
    }
    let lastError;
    let tries = 0;
    for (let k = 0; k < geminiClients.length && tries < GEMINI_MAX_TRIES; k++) {
        const idx = (geminiKeyCursor + k) % geminiClients.length;
        for (const model of GEMINI_MODELS) {
            if (tries >= GEMINI_MAX_TRIES) break;
            const cdKey = `${idx}|${model}`;
            if ((geminiCooldown.get(cdKey) || 0) > Date.now()) continue; 
            tries++;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const result = await geminiClients[idx].models.generateContent({
                        model,
                        contents: prompt,
                        config: { systemInstruction: BOT_PERSONA }
                    });
                    geminiKeyCursor = (idx + 1) % geminiClients.length;
                    return result;
                } catch (e) {
                    lastError = e;
                    if (e?.status === 503 && attempt === 0) {
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }
                    const ms = geminiCooldownMs(e);
                    if (ms) {
                        geminiCooldown.set(cdKey, Date.now() + ms);
                        console.warn(`⏳ Gemini مفتاح #${idx + 1} / ${model}: إيقاف ${Math.max(1, Math.round(ms / 60000))} دقيقة (خطأ ${e?.status})`);
                    }
                    break;
                }
            }
        }
    }
    if (!lastError) {
        const e = new Error('كل مفاتيح وموديلات Gemini بفترة انتظار (الحصة خلصت)');
        e.coolingDown = true;
        throw e;
    }
    throw lastError;
}

const PROVIDERS = [
    { name: 'Groq', key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
    { name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1/chat/completions', model: process.env.CEREBRAS_MODEL || 'llama-3.3-70b' },
    { name: 'Mistral', key: process.env.MISTRAL_API_KEY, url: 'https://api.mistral.ai/v1/chat/completions', model: process.env.MISTRAL_MODEL || 'mistral-small-latest' },
    { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions', model: process.env.OPENROUTER_MODEL || 'qwen/qwen-2.5-72b-instruct:free' },
].filter(p => p.key);
console.log('المزودون الاحتياطيون المفعّلون:', PROVIDERS.map(p => p.name).join(', ') || 'لا يوجد (Gemini فقط)');

async function askOpenAICompat(provider, prompt) {
    const res = await fetch(provider.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${provider.key}` },
        body: JSON.stringify({
            model: provider.model,
            messages: [
                { role: 'system', content: BOT_PERSONA },
                { role: 'user', content: prompt }
            ],
            temperature: 0.95,
            max_tokens: 500
        }),
        signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) {
        const err = new Error(`${provider.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content || '' };
}

let providerCursor = 0;

// Gemini First. then the others
const providerCooldown = new Map();

async function askAI(prompt) {
    if (geminiClients.length > 0) {
        try {
            const r = await askGemini(prompt);
            if (r?.text) return r;
        } catch (e) {
            if (!e.coolingDown) console.error('Gemini فشل، نجرب المزودين الاحتياطيين:', String(e.message).slice(0, 200));
        }
    }
    const count = PROVIDERS.length;
    for (let i = 0; i < count; i++) {
        const provider = PROVIDERS[(providerCursor + i) % count];
        if ((providerCooldown.get(provider.name) || 0) > Date.now()) continue;
        try {
            const r = await askOpenAICompat(provider, prompt);
            if (r.text) {
                providerCursor = (providerCursor + i + 1) % count;
                return r;
            }
        } catch (e) {
            console.error(`${provider.name} فشل، نجرب اللي بعده:`, String(e.message).slice(0, 200));
            const st = e?.status;
            const ms = st === 429 ? 2 * 60 * 1000
                : (st === 401 || st === 402 || st === 403 || st === 404) ? 60 * 60 * 1000
                : 30 * 1000;
            providerCooldown.set(provider.name, Date.now() + ms);
        }
    }
    throw new Error(count === 0
        ? 'Gemini خلصت حصته وما في مزود احتياطي مفعّل (ضيف GROQ_API_KEY مثلاً)'
        : 'كل المزودين فشلوا أو بفترة انتظار');
}

const isTrivial = t => t
    .replace(/https?:\/\/\S+/g, '')
    .replace(/:\w+:/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .length < 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let budgetDay = '';
let budgetUsed = 0;
function takeBudget() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== budgetDay) { budgetDay = today; budgetUsed = 0; }
    if (budgetUsed >= AUTOREPLY_DAILY_MAX) return false;
    budgetUsed++;
    return true;
}

function cleanReply(text) {
    return (text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^\s*(دووم|doom)\s*[:：]\s*/i, '')
        .replace(/^["«“]+|["»”]+$/g, '')
        .trim();
}

const nameOf = m => m.member?.displayName || m.author.globalName || m.author.username;

// Reads the chat in the room
let client; // يتعرف تحت
async function buildTranscript(message) {
    const recent = await message.channel.messages
        .fetch({ limit: HISTORY_LIMIT, before: message.id })
        .catch(() => null);
    if (!recent) return '';
    return [...recent.values()]
        .reverse()
        .filter(m => m.cleanContent)
        .map(m => `${nameOf(m)}${m.author.id === client.user.id ? ' (أنت)' : ''}: ${m.cleanContent.slice(0, 300)}`)
        .join('\n');
}

// --- 6TH BOT ---
client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`✅ تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);
    console.log(`رومات الدردشة المفتوحة: ${CHAT_CHANNEL_IDS.size ? [...CHAT_CHANNEL_IDS].join(', ') : 'لا يوجد'}`);
});

const busyChannels = new Set();
const lastAutoReply = new Map();

client.on('messageCreate', async (message) => {
    console.log(`رسالة من ${message.author.username} في روم ${message.channel.name}: ${message.content}`);

    if (message.author.bot || !message.guild) return;

    if (IGNORED_CHANNEL_IDS.has(message.channel.id)) return;
    const text = message.cleanContent.trim();
    if (!text) return;

    // To see if someone called the bot
    const mentioned = message.mentions.has(client.user.id, { ignoreEveryone: true, ignoreRoles: true });
    let repliedToBot = false;
    if (message.reference?.messageId && !mentioned) {
        const ref = await message.fetchReference().catch(() => null);
        repliedToBot = ref?.author?.id === client.user.id;
    }
    const direct = mentioned || repliedToBot || NAME_RE.test(text);
    const inChatChannel = CHAT_CHANNEL_IDS.has(message.channel.id);

    if (!direct) {
        if (!inChatChannel) return;
        if (isTrivial(text) || text.startsWith('/')) return;
        if (busyChannels.has(message.channel.id)) return;
        const now = Date.now();
        if (now - (lastAutoReply.get(message.channel.id) || 0) < AUTOREPLY_COOLDOWN_MS) return;
        if (Math.random() > AUTOREPLY_CHANCE) return;
        if (!takeBudget()) return;
        lastAutoReply.set(message.channel.id, now);
    }

    busyChannels.add(message.channel.id);
    try {
        await message.channel.sendTyping().catch(() => null);

        const transcript = await buildTranscript(message);
        const who = nameOf(message);
        const prompt =
            (transcript ? `آخر رسائل الروم (الأقدم أول):\n${transcript}\n\n` : '') +
            `الرسالة الجديدة:\n${who}: ${text}\n\n` +
            (direct
                ? `${who} يكلمك أو يقصدك، ردّ عليه مباشرة بأسلوبك.`
                : 'لو عندك تعليق ذكي أو قصفة أو رد طبيعي يناسب الرسالة الجديدة اكتبه، ولو ما في شي يستاهل تقوله اكتب كلمة SKIP فقط.') +
            ' اكتب الرد فقط بدون اسمك بالبداية.';

        const response = await askAI(prompt);
        const reply = cleanReply(response.text);

        if (!reply || (!direct && /^SKIP\b/i.test(reply))) return;

        await sleep(700 + Math.random() * 1300); // Small delay to make it seems that its writing
        await message.reply({
            content: reply.slice(0, 1990),
            // parse: [] To make sure it does not ping anyone
            allowedMentions: { parse: [], repliedUser: direct }
        });
    } catch (error) {
        console.error('خطأ في الـ AI:', error.message || error);
        if (direct) {
            await message.reply({
                content: BUSY_REPLIES[Math.floor(Math.random() * BUSY_REPLIES.length)],
                allowedMentions: { parse: [], repliedUser: false }
            }).catch(() => null);
        }
    } finally {
        busyChannels.delete(message.channel.id);
    }
});

client.on('error', e => console.error('Discord client error:', e));
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));

client.login(TOKEN);
