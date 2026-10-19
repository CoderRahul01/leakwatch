/**
 * Plain explanations of a leak, written by Gemma 4 (open weights) on Workers AI, with Gemma on
 * OpenRouter's free tier as backup. The model only writes words: every number in its text must
 * already be in the leak's evidence (same rule as shared/src/explain.ts), or we return nothing and
 * the app shows the rules sentence.
 */
const CF_GEMMA = '@cf/google/gemma-4-26b-a4b-it'
const OR_MODELS = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free']

const SYSTEM = `You explain one problem in someone's Meta ads to a busy small-business owner.
Write 2 or 3 short sentences in plain words: what is happening, why it costs them money, and the first thing to do.
No jargon (say "the tracking code" not "pixel event deduplication"), no headings, no lists, no greetings.
Use only numbers that appear in the facts, written exactly as given. Never invent a number.`

export const numbersIn = text => (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(n => n.replace(/,/g, '').replace(/\.0+$/, ''))

export function passesDigitCheck(text, leak) {
  const pool = [leak.title, leak.summary, ...(leak.facts || []).map(f => f.value), ...(leak.fixSteps || []), leak.since || ''].join(' ')
  const allowed = new Set(numbersIn(pool))
  return numbersIn(text).every(n => allowed.has(n))
}

export function promptFor(leak) {
  return [
    `Problem: ${leak.title}`,
    `What we measured: ${leak.summary}`,
    'Facts:',
    ...(leak.facts || []).map(f => `- ${f.label}: ${f.value}`),
    'Fix steps:',
    ...(leak.fixSteps || []).map(s => `- ${s}`)
  ].join('\n')
}

const clean = t => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s*["']|["']\s*$/g, '').replace(/\*\*/g, '').trim()

async function workersAI(env, prompt) {
  const out = await env.AI.run(CF_GEMMA, {
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
    max_tokens: 400, temperature: 0.2, chat_template_kwargs: { enable_thinking: false }
  })
  return clean(out?.choices?.[0]?.message?.content ?? out?.response)
}

async function openrouter(env, prompt) {
  if (!env.OPENROUTER_API_KEY) return ''
  for (const model of OR_MODELS) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'X-Title': 'Leakwatch' },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 400, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20_000)
    }).catch(() => null)
    if (!r?.ok) continue
    const t = clean((await r.json().catch(() => null))?.choices?.[0]?.message?.content)
    if (t) return t
  }
  return ''
}

/** Returns { text, engine } or { text: null } when no engine produced a checkable answer. */
export async function explain(env, leak) {
  const prompt = promptFor(leak)
  for (const [engine, run] of [['workers-ai', workersAI], ['openrouter', openrouter]]) {
    try {
      const text = await run(env, prompt)
      if (text && text.length > 20 && passesDigitCheck(text, leak)) return { text, engine }
      if (text) console.log('explain rejected (digits)', engine)
    } catch (e) { console.log('explain failed', engine, e.message) }
  }
  return { text: null, engine: 'rules' }
}
