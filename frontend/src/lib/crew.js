import { Code, Compass, PenLine, Scale, ScanText, Wrench } from "lucide-react";

// The agents, by the names the UI uses for them. Each has one job and one icon,
// used wherever its work shows up.
export const CREW = {
  analyst: { name: "Analyst", icon: ScanText, job: "Reads the requirement and lists what it leaves out" },
  drafter: { name: "Drafter", icon: PenLine, job: "Writes the test cases from the requirement and the app map" },
  scout: { name: "Scout", icon: Compass, job: "Walks the app and records the real buttons, fields and pages" },
  scripter: { name: "Scripter", icon: Code, job: "Turns what Scout recorded into a Playwright script" },
  mender: { name: "Mender", icon: Wrench, job: "Fixes a failed script, or stops when the app is at fault" },
  judge: { name: "Judge", icon: Scale, job: "Weighs the results and gives the release verdict" },
};
