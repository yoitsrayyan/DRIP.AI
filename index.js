const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');

// --- 1. خادم HTTP صغير لإبقاء البوت شغال على Render ---
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Drip is online!'));
app.listen(port, () => console.log(`Server is running on port ${port}`));

// --- 2. الإعدادات (كلها من متغيرات البيئة) ---
const TOKEN = process.env.DISCORD_TOKEN || '';

// الرومات اللي يسولف فيها البوت مع الكل بدون منشن (IDs مفصولة بفاصلة)
const CHAT_CHANNEL_IDS = new Set(
    (process.env.CHAT_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);
const AUTOREPLY_CHANCE = parseFloat(process.env.AUTOREPLY_CHANCE || '0.7');          // احتمال الرد على رسالة عادية
const AUTOREPLY_COOLDOWN_MS = parseInt(process.env.AUTOREPLY_COOLDOWN_SEC || '4', 10) * 1000; // أقل فاصل بين ردين تلقائيين بنفس الروم
const AUTOREPLY_DAILY_MAX = parseInt(process.env.AUTOREPLY_DAILY_MAX || '500', 10);   // ميزانية يومية للردود التلقائية (المنشن ما يتأثر فيها)
const HISTORY_LIMIT = parseInt(process.env.HISTORY_LIMIT || '14', 10);                // كم رسالة يقرأ قبل ما يرد 

// الرومات اللي البوت يتجاهلها تماماً وما يرد فيها أبداً (IDs مفصولة بفاصلة)
const IGNORED_CHANNEL_IDS = new Set(
    (process.env.IGNORED_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
);

const NAME_TRIGGERS = (process.env.NAME_TRIGGERS || 'دووم,doom').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_RE = new RegExp(`(^|[^\\p{L}\\p{N}])(${NAME_TRIGGERS.map(escapeRe).join('|')})($|[^\\p{L}\\p{N}])`, 'iu');

// --- 3. شخصية البوت (تقدر تغيرها من متغير BOT_PERSONA بدون ما تلمس الكود) ---
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

// ردود لما كل المزودين يفشلون (تنرسل بس لو أحد ناداك مباشرة)
const BUSY_REPLIES = [
    'راسي مسدود شوي، ثواني وأرجع',
    'استنى شوي يا صاحبي، مشغول الحين',
    'والله زحمة عندي، جرب بعد دقايق',
    'مو قادر أرد الحين، ثواني وأرجعلك'
];

// --- 4. مزودو الذكاء الاصطناعي ---
// Gemini (تقدر تضيف أكثر من مفتاح: GEMINI_API_KEY, GEMINI_API_KEY_2 ... _8)
const GEMINI_KEYS = [process.env.GEMINI_API_KEY, ...[2, 3, 4, 5, 6, 7, 8].map(i => process.env[`GEMINI_API_KEY_${i}`])].filter(Boolean);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.7-flash';
const geminiClients = GEMINI_KEYS.map(key => new GoogleGenAI({ apiKey: key }));
let geminiKeyCursor = 0;
console.log(`مفاتيح Gemini المفعّلة: ${GEMINI_KEYS.length}`);

async function askGemini(prompt) {
    if (geminiClients.length === 0) {
        const e = new Error('لا يوجد مفتاح Gemini');
        e.status = 0;
        throw e;
    }
    const models = [GEMINI_MODEL, GEMINI_FALLBACK_MODEL];
    let lastError;
    for (let k = 0; k < geminiClients.length; k++) {
        const idx = (geminiKeyCursor + k) % geminiClients.length;
        for (const model of models) {
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
                    break; // خلصت الحصة أو خطأ دائم: جرب الموديل/المفتاح التالي
                }
            }
        }
    }
    throw lastError;
}

// مزودون احتياطيون مجانيون (كلهم بصيغة OpenAI)، يشتغل اللي مفتاحه موجود
const PROVIDERS = [
    { name: 'OpenRouter', key: process.env.OPENROUTER_API_KEY, url: 'https://openrouter.ai/api/v1/chat/completions', model: 'qwen/qwen-2.5-72b-instruct' },
    { name: 'Groq', key: process.env.GROQ_API_KEY, url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
    { name: 'Mistral', key: process.env.MISTRAL_API_KEY, url: 'https://api.mistral.ai/v1/chat/completions', model: process.env.MISTRAL_MODEL || 'mistral-small-latest' },
    { name: 'Cerebras', key: process.env.CEREBRAS_API_KEY, url: 'https://api.cerebras.ai/v1/chat/completions', model: process.env.CEREBRAS_MODEL || 'llama-3.3-70b' },
].filter(p => p.key);
console.log('المزودون الاحتياطيون المفعّلون:', PROVIDERS.map(p => p.name).join(', ') || 'لا يوجد (Gemini فقط)');

const MODEL_PREFERENCE = [
    /mistral.*free/i, /gemma.*free/i, /qwen.*free/i
];

const MODEL_EXCLUDE = /whisper|guard|tts|embed|orpheus|playai|safeguard|moderation|vision|ocr|transcribe|rerank|compound/i;

// لو اسم النموذج انحذف عند المزود، نجيب قائمة النماذج ونختار أنسب واحد
async function discoverModel(provider) {
    const res = await fetch(provider.url.replace('/chat/completions', '/models'), {
        headers: { 'Authorization': `Bearer ${provider.key}` },
        signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw new Error(`تعذر جلب قائمة نماذج ${provider.name}: ${res.status}`);
    const data = await res.json();
    const ids = (data.data || []).map(m => m.id).filter(id => id && !MODEL_EXCLUDE.test(id));
    for (const pattern of MODEL_PREFERENCE) {
        const found = ids.find(id => pattern.test(id));
        if (found) return found;
    }
    return ids[0] || null;
}

async function askOpenAICompat(provider, prompt, allowDiscovery = true) {
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
            max_tokens: 300
        }),
        signal: AbortSignal.timeout(60000)
    });
    if (!res.ok) {
        if (false && allowDiscovery) {
            const newModel = await discoverModel(provider);
            if (newModel && newModel !== provider.model) {
                console.log(`🔄 ${provider.name}: النموذج ${provider.model} غير متاح، نستخدم ${newModel}`);
                provider.model = newModel;
                return askOpenAICompat(provider, prompt, false);
            }
        }
        const err = new Error(`${provider.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
        err.status = res.status;
        throw err;
    }
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content || '' };
}

let providerCursor = 0;

// Gemini أولاً، ولو فشل ننتقل للمزودين الاحتياطيين بالتناوب
async function askAI(prompt) {
    if (geminiClients.length > 0) {
        try {
            const r = await askGemini(prompt);
            if (r?.text) return r;
        } catch (e) {
            console.error('Gemini فشل، نجرب المزودين الاحتياطيين:', e.message);
        }
    }
    const count = PROVIDERS.length;
    for (let i = 0; i < count; i++) {
        const provider = PROVIDERS[(providerCursor + i) % count];
        try {
            const r = await askOpenAICompat(provider, prompt);
            if (r.text) {
                providerCursor = (providerCursor + i + 1) % count;
                return r;
            }
        } catch (e) {
            console.error(`${provider.name} فشل، نجرب اللي بعده:`, e.message);
        }
    }
    throw new Error('كل المزودين فشلوا');
}

// --- 5. أدوات مساعدة ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ميزانية يومية للردود التلقائية عشان ما تخلص الحصة المجانية
let budgetDay = '';
let budgetUsed = 0;
function takeBudget() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== budgetDay) { budgetDay = today; budgetUsed = 0; }
    if (budgetUsed >= AUTOREPLY_DAILY_MAX) return false;
    budgetUsed++;
    return true;
}

// ينظف رد النموذج: يشيل وسوم التفكير وأي "Drip:" بأول الرد وعلامات الاقتباس
function cleanReply(text) {
    return (text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/^\s*(دووم|doom)\s*[:：]\s*/i, '')
        .replace(/^["«“]+|["»”]+$/g, '')
        .trim();
}

const nameOf = m => m.member?.displayName || m.author.globalName || m.author.username;

// يقرأ آخر رسائل الروم عشان يفهم الحوار ومين يحكي مع مين
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

// --- 6. البوت ---
client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('clientReady', () => {
    console.log(`✅ تم تشغيل البوت بنجاح باسم: ${client.user.tag}`);
    console.log(`رومات الدردشة المفتوحة: ${CHAT_CHANNEL_IDS.size ? [...CHAT_CHANNEL_IDS].join(', ') : 'لا يوجد (يرد فقط على المنشن/الرد/الاسم)'}`);
});

const busyChannels = new Set();
const lastAutoReply = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (IGNORED_CHANNEL_IDS.has(message.channel.id)) return;
    const text = message.cleanContent.trim();
    if (!text) return;

    // هل أحد يكلم البوت مباشرة؟ (منشن / رد على رسالته / ذكر اسمه)
    const mentioned = message.mentions.has(client.user.id, { ignoreEveryone: true, ignoreRoles: true });
    let repliedToBot = false;
    if (message.reference?.messageId && !mentioned) {
        const ref = await message.fetchReference().catch(() => null);
        repliedToBot = ref?.author?.id === client.user.id;
    }
    const direct = mentioned || repliedToBot || NAME_RE.test(text);
    const inChatChannel = CHAT_CHANNEL_IDS.has(message.channel.id);

    if (!direct) {
        // رسالة عادية: يرد عليها بس لو الروم من رومات الدردشة، وبنسبة وفاصل وميزانية
        if (!inChatChannel) return;
        if (text.length < 2 || text.startsWith('/')) return;
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

        await sleep(700 + Math.random() * 1300); // تأخير بسيط يحسسك إنه يكتب
        await message.reply({
            content: reply.slice(0, 1990),
            // parse: [] يمنع أي منشن @everyone أو @role يطلع من النموذج
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
