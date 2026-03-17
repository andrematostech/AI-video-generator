import { VideoGeneratorForm } from "@/components/video-generator-form";

const previewCards = [
  {
    title: "Black hole mysteries",
    label: "Space documentary",
    tone: "from-stone-100/10 via-stone-100/5 to-transparent",
    background:
      "radial-gradient(circle at 45% 50%, rgba(255,210,153,0.95), rgba(255,140,61,0.4) 18%, rgba(9,12,24,0.1) 25%, rgba(22,34,68,0.72) 38%, rgba(7,8,14,0.96) 58%)"
  },
  {
    title: "Wilderness odyssey",
    label: "Cinematic travel frame",
    tone: "from-amber-200/15 via-transparent to-transparent",
    background:
      "linear-gradient(180deg, rgba(246,225,198,0.95), rgba(112,141,118,0.45) 42%, rgba(28,43,41,0.9) 100%)"
  },
  {
    title: "Workshop story",
    label: "Story-led narrative shot",
    tone: "from-blue-200/15 via-transparent to-transparent",
    background:
      "linear-gradient(135deg, rgba(255,170,76,0.28), rgba(63,31,18,0.94) 45%, rgba(14,11,12,0.96) 100%)"
  },
  {
    title: "Future city",
    label: "AI sci-fi character scene",
    tone: "from-white/10 via-transparent to-transparent",
    background:
      "linear-gradient(135deg, rgba(69,135,255,0.35), rgba(122,96,255,0.25) 46%, rgba(10,12,19,0.98) 100%)"
  }
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 md:px-8 md:py-8">
      <section className="premium-shell animate-fade-up px-5 py-6 md:px-8 md:py-8">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at top, rgba(255,255,255,0.1), transparent 20%), radial-gradient(circle at center, rgba(124,92,255,0.16), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%)"
          }}
        />
        <div className="relative">
          <div className="mx-auto flex max-w-4xl flex-col items-center py-12 text-center md:py-16">
            <div className="text-5xl font-semibold tracking-[-0.04em] text-white md:text-6xl">
              Lumo
            </div>
            <h1 className="mt-10 max-w-3xl text-4xl leading-[1.12] text-stone-50 md:text-6xl">
              Generate AI videos
              <br />
              from a single prompt
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-stone-400 md:text-lg">
              Turn prompts into cinematic videos with AI-powered scenes,
              narration, and rendering.
            </p>
            <div className="mt-10 w-full max-w-2xl">
              <VideoGeneratorForm />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-5 grid w-full max-w-4xl gap-3 md:grid-cols-3">
        {[
          "Script + Scenes (OpenAI)",
          "Video clips (Replicate)",
          "Rendered with FFmpeg"
        ].map((item, index) => (
          <div
            key={item}
            className="premium-panel animate-fade-up px-4 py-3 text-sm text-stone-200"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            {item}
          </div>
        ))}
      </section>

      <section className="mx-auto mt-8 w-full max-w-5xl">
        <div className="grid gap-4 md:grid-cols-2">
          {previewCards.map((card) => (
              <div
                key={card.title}
                className={`group relative aspect-[1.62] overflow-hidden rounded-[1.4rem] border border-white/10 bg-gradient-to-br ${card.tone} bg-dusk`}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at top, rgba(255,255,255,0.2), transparent 20%), linear-gradient(180deg, transparent, rgba(6,8,14,0.82))"
                  }}
                />
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-80"
                  style={{
                    backgroundImage: card.background
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-300">
                    {card.label}
                  </p>
                  <h2 className="mt-2 text-2xl text-stone-50">{card.title}</h2>
                </div>
              </div>
            ))}
        </div>
      </section>
    </main>
  );
}
