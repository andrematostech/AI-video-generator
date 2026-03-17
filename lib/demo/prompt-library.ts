export type DemoPromptCategory =
  | "educational"
  | "storytelling"
  | "explainer";

export type DemoPrompt = {
  id: string;
  category: DemoPromptCategory;
  title: string;
  prompt: string;
};

export const demoPromptLibrary: DemoPrompt[] = [
  {
    id: "edu-solar-basics",
    category: "educational",
    title: "How Solar Panels Work",
    prompt:
      "Create a clear, cinematic 25 second educational video explaining how solar panels turn sunlight into electricity, using simple language, visual step-by-step scenes, and a confident teacher-like tone."
  },
  {
    id: "edu-ocean-plastic",
    category: "educational",
    title: "Ocean Plastic Awareness",
    prompt:
      "Create a short educational video about how plastic pollution affects ocean life, with emotionally clear visuals, one key fact per scene, and an encouraging closing message about small actions people can take."
  },
  {
    id: "story-small-bakery",
    category: "storytelling",
    title: "Small Bakery Story",
    prompt:
      "Create a warm storytelling video about a family bakery that opens before sunrise, bakes fresh bread by hand, serves the neighborhood all morning, and ends with a heartfelt brand moment."
  },
  {
    id: "story-founder-journey",
    category: "storytelling",
    title: "Founder Journey",
    prompt:
      "Create an inspiring startup founder story video showing a person working late nights, facing early setbacks, finding product-market fit, and ending with a hopeful launch-day payoff."
  },
  {
    id: "explainer-ai-notes",
    category: "explainer",
    title: "AI Notes App Explainer",
    prompt:
      "Create a polished 20 second explainer video for an AI note-taking app that captures meetings, summarizes action items, and helps remote teams stay aligned, with clean product-focused visuals."
  },
  {
    id: "explainer-budget-tracker",
    category: "explainer",
    title: "Budget Tracker Explainer",
    prompt:
      "Create a crisp explainer video for a personal finance app that automatically categorizes spending, shows monthly trends, and helps users build smarter money habits with simple dashboard-style visuals."
  }
];

export function getRandomDemoPrompt() {
  const index = Math.floor(Math.random() * demoPromptLibrary.length);
  return demoPromptLibrary[index];
}

export function getDemoPromptById(id: string) {
  return demoPromptLibrary.find((item) => item.id === id) ?? null;
}
