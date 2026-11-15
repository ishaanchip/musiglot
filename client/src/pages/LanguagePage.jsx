import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LANGUAGES } from '../api.js';

export default function LanguagePage() {
  const navigate = useNavigate();
  const choose = (code) => {
    localStorage.setItem('musiglot.language', code);
    navigate(`/catalog/${code}`);
  };
  return (
    <main className="narrow">
      <h1>What do you want to learn?</h1>
      <div className="language-grid">
        {Object.entries(LANGUAGES).map(([code, lang]) => (
          <button key={code} className="card language-card" onClick={() => choose(code)}>
            <span className="language-native">{lang.native}</span>
            <span>{lang.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
