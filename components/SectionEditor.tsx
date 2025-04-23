// app/components/SectionEditor.tsx
"use client";

import React, { useState } from "react";

export interface Section {
  id: string;
  start: number;
  end: number;
  performanceScore?: number;
}

interface SectionEditorProps {
  sections: Section[];
  onChange: (sections: Section[]) => void;
}

const SectionEditor: React.FC<SectionEditorProps> = ({ sections, onChange }) => {
  const [localSections, setLocalSections] = useState<Section[]>(sections);

  const addSection = () => {
    const newSection: Section = {
      id: Date.now().toString(),
      start: 0,
      end: 10,
    };
    const updated = [...localSections, newSection];
    setLocalSections(updated);
    onChange(updated);
  };

  const updateSection = (id: string, key: "start" | "end", value: number) => {
    const updated = localSections.map((section) => {
      if (section.id === id) {
        return { ...section, [key]: value };
      }
      return section;
    });
    setLocalSections(updated);
    onChange(updated);
  };

  const removeSection = (id: string) => {
    const updated = localSections.filter((section) => section.id !== id);
    setLocalSections(updated);
    onChange(updated);
  };

  return (
    <div className="section-editor">
      <h4>Édition des sections</h4>
      {localSections.map((section) => (
        <div key={section.id} className="section-item">
          <label>Début (s) :</label>
          <input
            type="number"
            value={section.start}
            onChange={(e) =>
              updateSection(section.id, "start", parseFloat(e.target.value))
            }
          />
          <label>Fin (s) :</label>
          <input
            type="number"
            value={section.end}
            onChange={(e) =>
              updateSection(section.id, "end", parseFloat(e.target.value))
            }
          />
          <button onClick={() => removeSection(section.id)}>Supprimer</button>
        </div>
      ))}
      <button onClick={addSection}>Ajouter une section</button>
    </div>
  );
};

export default SectionEditor;
