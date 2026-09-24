import { getPersonas, type Difficulty, type InterviewType, type TranscriptTurn } from "./types";

/**
 * Deterministic offline interviewer used when Gemini is unavailable (no key / outage).
 * It still enforces difficulty behavior so fallback_text mode feels right.
 */
const BANK: Record<InterviewType, string[]> = {
  hr: [
    "Walk me through your background and why you're interested in this role.",
    "What do you know about our company, and why do you want to work here specifically?",
    "Tell me about a time you disagreed with a manager. How did you handle it?",
    "Describe a situation where you had to adapt quickly to a big change.",
    "What kind of team culture helps you do your best work?",
    "Where do you see your career in the next three years?",
    "What questions do you have for me?",
  ],
  technical: [
    "Walk us through a system you designed end to end. What were the key components?",
    "How would you design a rate limiter for a public API serving millions of requests per day?",
    "Tell us about a production incident you owned. What was the root cause and what changed afterwards?",
    "How do you decide between consistency and availability in a distributed system you've built?",
    "Describe a technical tradeoff you made that you'd reverse today. Why?",
    "How do you approach observability for a new service?",
    "What questions do you have for us?",
  ],
  coding: [
    "Let's start with a problem: given an array of integers and a target, return the indices of two numbers that add up to the target. Talk me through your approach.",
    "What's the time and space complexity of that approach? Can you do better?",
    "What edge cases would you test for?",
    "New problem: how would you detect a cycle in a linked list? Explain the algorithm.",
    "How would you design an LRU cache? Which data structures would you use and why?",
    "Tell us about a piece of code you're proud of and how you made it maintainable.",
    "What questions do you have for us?",
  ],
  situational: [
    "Tell me about a time you had to deliver results under a tight deadline.",
    "Describe a conflict with a teammate and how you resolved it.",
    "Tell me about a mistake you made at work. What did you learn?",
    "Give me an example of when you took ownership of a problem nobody else wanted.",
    "Describe a time you had to influence someone without authority.",
    "Tell me about a decision you made with incomplete information.",
    "What questions do you have for me?",
  ],
  custom: [
    "To start, tell me about yourself and what draws you to this role.",
    "Tell me about the most relevant project you've worked on for this position.",
    "What was the hardest problem in that project and how did you solve it?",
    "Describe a time you failed and what you changed afterwards.",
    "How would you approach your first 90 days here?",
    "What makes you a strong fit compared to other candidates?",
    "What questions do you have for me?",
  ],
};

function analyze(answer: string) {
  const w = answer.trim().split(/\s+/).filter(Boolean).length;
  return {
    words: w,
    hasMetric: /\d|percent|%|million|thousand|doubled|halved/i.test(answer),
    weHeavy: (answer.match(/\bwe\b|\bour\b/gi)?.length ?? 0) > (answer.match(/\bI\b/g)?.length ?? 0),
    hasResult: /(result|outcome|impact|so that|which led|as a result|increased|reduced|improved)/i.test(answer),
  };
}

export function localInterviewerReply(opts: {
  type: InterviewType;
  difficulty: Difficulty;
  panelSize: number;
  companyName: string;
  turns: TranscriptTurn[];
}): { speaker: "interviewer_1" | "interviewer_2"; speakerName: string; text: string } {
  const personas = getPersonas(opts.type, opts.panelSize);
  const ivTurns = opts.turns.filter((t) => t.speaker.startsWith("interviewer"));
  const lastCand = [...opts.turns].reverse().find((t) => t.speaker === "candidate");
  const lastIv = ivTurns[ivTurns.length - 1];
  const bank = BANK[opts.type];
  const questionsAsked = ivTurns.filter((t) => !t.text.startsWith("[f]")).length;

  // Opening
  if (!ivTurns.length) {
    const p = personas[0];
    const intro =
      personas.length > 1
        ? `Hi, I'm ${p.name}, ${p.title}. With me is ${personas[1].name}, our ${personas[1].title}. `
        : `Hi, I'm ${p.name}, ${p.title} at ${opts.companyName || "the company"}. `;
    const tone = opts.difficulty === "easy" ? "Take your time — there are no trick questions. " : opts.difficulty === "hard" ? "We'll keep this tight. " : "";
    return { speaker: p.key, speakerName: p.name, text: `${intro}${tone}${bank[0]}` };
  }

  // Count follow-ups since last main question
  let followUps = 0;
  for (let i = opts.turns.length - 1; i >= 0; i--) {
    const t = opts.turns[i];
    if (t.speaker.startsWith("interviewer")) {
      if (t.channel === "text" && /^(That's vague|You didn't answer|What did YOU|Can you put a number|What alternatives|Nice start|Good —|Try framing)/.test(t.text)) followUps++;
      else break;
    }
  }
  const maxFollow = opts.difficulty === "easy" ? 1 : opts.difficulty === "medium" ? 1 : 2;
  const current = personas.find((p) => p.key === lastIv?.speaker) ?? personas[0];

  if (lastCand && followUps < maxFollow) {
    const a = analyze(lastCand.text);
    let f: string | null = null;
    if (opts.difficulty === "hard") {
      if (a.words < 25) f = "You didn't answer the question. Start with the result, then your actions.";
      else if (a.weHeavy) f = "What did YOU do specifically? Not the team — you.";
      else if (!a.hasMetric) f = "That's vague. Give me a concrete example and measurable impact.";
      else if (!a.hasResult) f = "What was the final outcome, and how did you measure it? And what would break if the scale were 10x?";
    } else if (opts.difficulty === "medium") {
      if (!a.hasMetric) f = "Can you put a number on the impact? What changed, and by how much?";
      else if (a.words > 30 && followUps === 0) f = "What alternatives did you consider, and why did you choose this one?";
    } else {
      if (a.words < 25) f = "Try framing it with STAR — start with the Situation, then the Task, what Action you took, and the Result. Want to give it another go?";
      else if (!a.hasResult) f = "Nice start. What was the result at the end? Even a rough number helps.";
    }
    if (f) return { speaker: current.key, speakerName: current.name, text: f };
  }

  const nextIdx = Math.min(bank.length - 1, Math.max(1, questionsAsked - countFollowUpsTotal(opts.turns)));
  const next = bank[nextIdx] ?? bank[bank.length - 1];
  const speaker = personas.length > 1 ? personas[nextIdx % 2] : personas[0];
  const switched = speaker.key !== lastIv?.speaker && personas.length > 1;
  const ack = opts.difficulty === "easy" ? "Thanks, that's helpful. " : opts.difficulty === "medium" ? "Okay. " : "";
  const text = `${switched ? `${speaker.name} here — ` : ack}${next}`;
  return { speaker: speaker.key, speakerName: speaker.name, text };
}

function countFollowUpsTotal(turns: TranscriptTurn[]) {
  return turns.filter(
    (t) =>
      t.speaker.startsWith("interviewer") &&
      /^(That's vague|You didn't answer|What did YOU|Can you put a number|What alternatives|Nice start|Try framing|What was the final outcome)/.test(t.text)
  ).length;
}
