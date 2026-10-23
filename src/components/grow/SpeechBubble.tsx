// PR #46: a small reusable speech bubble anchored above the character.
// Always displays text the server already generated (characterReply /
// savedReply / quiz·exam result messages from GrowthContext) — this
// component never invents dialogue, same rule InteractionPanel/ExamPanel
// already follow.
export default function SpeechBubble({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute -top-2 left-1/2 w-max max-w-[85%] -translate-x-1/2 -translate-y-full px-2">
      <div className="motion-safe:animate-[grow-bubble-pop_0.25s_ease-out] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-md ring-1 ring-slate-900/5">
        {text}
      </div>
    </div>
  )
}
