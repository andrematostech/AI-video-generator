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
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 md:px-8 md:py-8">
      <div className="hero-glow" />

      <header className="relative z-10 flex items-center justify-between">
        <div className="text-[2rem] font-semibold tracking-[-0.05em] text-white md:text-[2.35rem]">
          Lumo
        </div>
        <div className="hidden text-sm text-stone-500 md:block">Turn prompts into cinematic videos</div>
      </header>

      <section className="relative z-10 animate-fade-up pt-8 md:pt-12">
        <div className="grid items-start gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div className="max-w-xl pt-4">
            <h1 className="max-w-2xl text-[2.65rem] font-medium leading-[1.02] tracking-[-0.055em] text-stone-50 md:text-[4.65rem] lg:text-[4.9rem]">
              Generate AI videos
              <br />
              from a single prompt
            </h1>
            <p className="mt-5 max-w-lg text-[1rem] leading-8 text-stone-400 md:text-[1.06rem]">
              Turn prompts into cinematic videos with AI-powered scenes,
              narration, and rendering.
            </p>
          </div>

          <div className="flex flex-col items-center lg:items-stretch">
            <div className="w-full max-w-xl self-center">
              <VideoGeneratorForm />
            </div>
            <section className="mt-7 grid w-full gap-3 md:grid-cols-3">
              {[
                "Script + Scenes (OpenAI)",
                "Video clips (Replicate)",
                "Rendered with FFmpeg"
              ].map((item, index) => (
                <div
                  key={item}
                  className="premium-panel interactive-card animate-fade-up px-4 py-3 text-sm text-stone-200"
                  style={{ animationDelay: `${index * 90}ms` }}
                >
                  {item}
                </div>
              ))}
            </section>

            <section className="mt-8 w-full pb-10">
              <div className="grid gap-4 md:grid-cols-2">
                {previewCards.map((card) => (
                  <div
                    key={card.title}
                    className={`group interactive-card relative aspect-[1.62] overflow-hidden rounded-[0.85rem] border border-white/10 bg-gradient-to-br ${card.tone} bg-dusk`}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at top, rgba(255,255,255,0.2), transparent 20%), linear-gradient(180deg, transparent, rgba(6,8,14,0.82))"
                      }}
                    />
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-80 transition duration-300 group-hover:scale-[1.02]"
                      style={{
                        backgroundImage: card.background
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_24%)] opacity-70" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-stone-300">
                        {card.label}
                      </p>
                      <h2 className="mt-2 text-2xl tracking-[-0.03em] text-stone-50">
                        {card.title}
                      </h2>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
