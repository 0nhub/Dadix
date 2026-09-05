import { useState, useEffect } from "react";
import { getProjectMeta } from "./lib/dadix";
import type { ProjectMeta } from "./types";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { ProjectLayout } from "./components/ProjectLayout";
import "./App.css";

function App() {
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getProjectMeta()
      .then((meta) => {
        if (meta) setProject(meta);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="app-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (project) {
    return (
      <ProjectLayout
        initialMeta={project}
        onClose={() => setProject(null)}
      />
    );
  }

  return <WelcomeScreen onOpen={setProject} />;
}

export default App;
