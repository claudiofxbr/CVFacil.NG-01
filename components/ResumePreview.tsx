import React from 'react';
import { ResumeData } from '../types';

interface ResumePreviewProps {
  data: ResumeData;
}

const ResumePreview: React.FC<ResumePreviewProps> = ({ data }) => {
  const { templateId, themeMode } = data;
  const isDark = themeMode === 'dark';

  // Helper styles for 3x4 photo frame standard
  const photoFrameStyle = "aspect-[3/4] object-cover object-top";

  // --- 1. ORIGINAL (Forest / Terracotta) ---
  if (templateId === 'original') {
    // Light: Cream/Paper background, Dark text
    // Dark: Forest Deep background, Light text
    const bgClass = isDark ? "bg-forest-base text-stone-200" : "bg-amber-50 text-stone-800";
    const surfaceClass = isDark ? "bg-forest-surface border-forest-border text-stone-400" : "bg-white border-amber-200 text-stone-600 shadow-sm";
    const headerTitleClass = isDark ? "text-white" : "text-stone-900";
    const subTitleClass = isDark ? "text-white" : "text-stone-800";
    const textMuted = isDark ? "text-stone-400" : "text-stone-600";
    
    return (
      <div className={`w-full font-sans p-8 md:p-12 shadow-2xl ${bgClass}`}>
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Header */}
          <header className="flex flex-col md:flex-row gap-8 items-center md:items-start">
            <div className="w-32 md:w-40 flex-shrink-0 relative">
               <div className="absolute inset-0 border-2 border-primary/30 rounded-xl transform rotate-3"></div>
               <img src={data.avatarUrl} alt={data.fullName} className={`w-full rounded-xl shadow-xl relative z-10 grayscale hover:grayscale-0 transition-all duration-500 ${photoFrameStyle}`} />
            </div>
            <div className="text-center md:text-left flex-1">
              <h1 className={`text-4xl md:text-5xl font-display font-bold mb-2 uppercase tracking-wide ${headerTitleClass}`}>
                {data.fullName.split(' ')[0]} <span className="text-primary">{data.fullName.split(' ').slice(1).join(' ')}</span>
              </h1>
              <p className="text-xl text-primary/90 font-medium mb-6">{data.role}</p>
              <p className={`${textMuted} leading-relaxed text-sm md:text-base`}>{data.summary}</p>
            </div>
          </header>
          {/* Contact Bar - Adjusted for LinkedIn fitting */}
          <div className={`${surfaceClass} p-6 rounded-2xl border flex flex-wrap justify-center md:justify-between gap-4 text-sm w-full`}>
             <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">mail</span><span className="break-all">{data.email}</span></div>
             <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">call</span><span>{data.phone}</span></div>
             <div className="flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">public</span><span className="break-all">{data.portfolio}</span></div>
             {/* LinkedIn ajustado: fonte menor e quebra de linha */}
             <div className="flex items-center gap-2 min-w-[200px]"><span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0">link</span><span className="text-xs break-all font-medium">{data.linkedin}</span></div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-8 space-y-10">
              <section>
                <h2 className="text-sm font-display font-bold text-primary uppercase tracking-[0.2em] mb-6 flex items-center gap-3"><span className="material-symbols-outlined">work</span>Experiência Profissional</h2>
                <div className="space-y-6">
                  {data.experiences.map((exp) => (
                    <div key={exp.id} className={`relative pl-6 border-l-2 ${isDark ? 'border-forest-border' : 'border-amber-200'}`}>
                      <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-primary"></div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className={`text-lg font-bold ${subTitleClass}`}>{exp.role}</h3>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${isDark ? 'bg-forest-surface text-stone-400 border-forest-border' : 'bg-amber-100 text-stone-600 border-amber-200'}`}>{exp.period}</span>
                      </div>
                      <p className="text-primary text-sm font-medium mb-3">{exp.company}</p>
                      <p className={`text-sm leading-relaxed ${textMuted}`}>{exp.description}</p>
                    </div>
                  ))}
                </div>
              </section>
               <section>
                <h2 className="text-sm font-display font-bold text-primary uppercase tracking-[0.2em] mb-6 flex items-center gap-3"><span className="material-symbols-outlined">school</span>Formação Acadêmica</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.education.map((edu) => (
                    <div key={edu.id} className={`${isDark ? 'bg-forest-surface/50' : 'bg-white border border-amber-100'} p-5 rounded-xl border-l-4 border-l-primary`}>
                      <h4 className={`font-bold text-sm mb-1 ${subTitleClass}`}>{edu.degree}</h4>
                      <p className={`text-xs mb-3 ${textMuted}`}>{edu.institution}</p>
                      <div className="flex justify-between items-center">
                          <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">{edu.type}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isDark ? 'bg-forest-deep text-stone-400' : 'bg-amber-100 text-stone-600'}`}>{edu.year}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="lg:col-span-4 space-y-10">
              <section>
                <h2 className={`text-sm font-display font-bold uppercase tracking-[0.2em] mb-6 ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>Experiências</h2>
                <div className="space-y-5">
                  {data.skills.map((skill) => (
                    <div key={skill.id}>
                      <div className={`flex justify-between text-[11px] mb-2 uppercase tracking-wider ${textMuted}`}>
                        <span>{skill.name}</span><span className="text-primary font-bold">{skill.level}%</span>
                      </div>
                      <div className={`h-1.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-forest-surface' : 'bg-amber-200'}`}><div className="h-full bg-primary transition-all duration-1000" style={{ width: `${skill.level}%` }}></div></div>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h2 className={`text-sm font-display font-bold uppercase tracking-[0.2em] mb-6 ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>Idiomas</h2>
                <div className="flex flex-wrap gap-2">
                  {data.languages.map((lang) => (
                    <div key={lang.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${surfaceClass}`}><span className={`text-xs font-bold ${isDark ? 'text-stone-300' : 'text-stone-600'}`}>{lang.name}</span><span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{lang.level}</span></div>
                  ))}
                </div>
              </section>
              <section>
                 <h2 className={`text-sm font-display font-bold uppercase tracking-[0.2em] mb-6 ${isDark ? 'text-stone-500' : 'text-stone-400'}`}>Hobbies</h2>
                 <div className="flex flex-wrap gap-2">
                   {data.hobbies.map((hobby, idx) => (
                      <span key={idx} className={`text-xs px-2 py-1 rounded border ${surfaceClass}`}>{hobby}</span>
                   ))}
                 </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- 2. BLUE (Corporate Blue) ---
  if (templateId === 'blue') {
    // Light: Standard white/blue
    // Dark: Slate-900 background, Blue-950 sidebar
    const containerClass = isDark ? "bg-slate-900 text-slate-200" : "bg-slate-50 text-slate-800";
    const sidebarClass = isDark ? "bg-blue-950 text-white" : "bg-blue-900 text-white";
    const contentBg = isDark ? "bg-slate-900" : "bg-white";
    const headerTitle = isDark ? "text-blue-400" : "text-blue-900";
    const sectionTitle = isDark ? "text-blue-300 bg-blue-900/50" : "text-blue-900 bg-blue-100";
    const textSub = isDark ? "text-slate-400" : "text-slate-600";
    const cardBg = isDark ? "bg-slate-800 border-blue-900" : "bg-slate-50 border-blue-600";
    const mainTitle = isDark ? "text-slate-100" : "text-slate-800";

    return (
      <div className={`w-full flex flex-col md:flex-row font-sans ${containerClass}`}>
        <aside className={`w-full md:w-1/3 p-8 space-y-8 ${sidebarClass}`}>
          <div className="w-32 mx-auto border-4 border-blue-400 mb-6 bg-white">
            <img src={data.avatarUrl} alt={data.fullName} className={`w-full ${photoFrameStyle}`} />
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-blue-200 uppercase tracking-widest border-b border-blue-700 pb-2">Contato</h3>
            <div className="text-sm space-y-2 opacity-90">
              <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">mail</span> {data.email}</p>
              <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">call</span> {data.phone}</p>
              <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">link</span> <span className="break-all text-xs">{data.linkedin}</span></p>
              {data.portfolio && (
                <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">language</span> <span className="break-all text-xs">{data.portfolio}</span></p>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-blue-200 uppercase tracking-widest border-b border-blue-700 pb-2">Experiências</h3>
            {data.skills.map(s => (
              <div key={s.id} className="text-sm">
                <div className="flex justify-between mb-1"><span>{s.name}</span><span>{s.level}%</span></div>
                <div className="h-1 bg-blue-800 rounded"><div className="h-full bg-blue-400 rounded" style={{width: `${s.level}%`}}></div></div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-blue-200 uppercase tracking-widest border-b border-blue-700 pb-2">Idiomas</h3>
            <div className="flex flex-wrap gap-2">
              {data.languages.map(l => (
                <span key={l.id} className="bg-blue-800 px-2 py-1 text-xs rounded text-blue-100">{l.name} - {l.level}</span>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="font-bold text-blue-200 uppercase tracking-widest border-b border-blue-700 pb-2">Hobbies</h3>
            <ul className="list-disc list-inside text-sm text-blue-100">
               {data.hobbies.map((h, i) => <li key={i}>{h}</li>)}
            </ul>
          </div>
        </aside>
        <main className={`w-full md:w-2/3 p-8 md:p-12 ${contentBg}`}>
           <header className="mb-10 border-b-2 border-blue-100 pb-6">
             <h1 className={`text-4xl font-display font-bold uppercase ${headerTitle}`}>{data.fullName}</h1>
             <p className="text-xl text-blue-600 mt-2 font-medium">{data.role}</p>
             <p className={`mt-4 leading-relaxed ${textSub}`}>{data.summary}</p>
           </header>
           
           <section className="mb-8">
             <h2 className={`text-xl font-bold uppercase tracking-widest mb-6 flex items-center gap-2 ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>
               <span className={`material-symbols-outlined p-1 rounded ${sectionTitle}`}>work</span> Experiência
             </h2>
             <div className="space-y-6 border-l-2 border-blue-100 ml-2 pl-6">
                {data.experiences.map(exp => (
                  <div key={exp.id} className="relative">
                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full border-4 border-white bg-blue-600"></div>
                    <h3 className={`font-bold text-lg ${mainTitle}`}>{exp.role}</h3>
                    <div className="text-blue-600 text-sm font-bold mb-2">{exp.company} | {exp.period}</div>
                    <p className={`text-sm ${textSub}`}>{exp.description}</p>
                  </div>
                ))}
             </div>
           </section>

           <section>
             <h2 className={`text-xl font-bold uppercase tracking-widest mb-6 flex items-center gap-2 ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>
               <span className={`material-symbols-outlined p-1 rounded ${sectionTitle}`}>school</span> Educação
             </h2>
             <div className="grid grid-cols-1 gap-4">
                {data.education.map(edu => (
                  <div key={edu.id} className={`p-4 rounded border-l-4 ${cardBg}`}>
                    <h3 className={`font-bold ${mainTitle}`}>{edu.degree}</h3>
                    <p className="text-sm text-blue-600">{edu.institution} • {edu.year}</p>
                    <p className="text-xs text-slate-500 mt-1 uppercase">{edu.type}</p>
                  </div>
                ))}
             </div>
           </section>
        </main>
      </div>
    );
  }

  // --- 3. RED (Bold Red) ---
  if (templateId === 'red') {
    // Light: White BG, Dark Text
    // Dark: Neutral-900 BG, Light Text
    const bgClass = isDark ? "bg-neutral-900 text-neutral-200" : "bg-white text-neutral-800";
    const headerBg = isDark ? "bg-neutral-800" : "bg-neutral-100";
    const quoteBg = isDark ? "bg-neutral-800/50" : "bg-neutral-50";
    const titleColor = isDark ? "text-white" : "text-black";
    const subTextColor = isDark ? "text-neutral-400" : "text-neutral-500";
    const mainTextColor = isDark ? "text-neutral-300" : "text-neutral-700";
    
    return (
      <div className={`w-full p-8 font-display ${bgClass}`}>
         <header className="text-center border-b-4 border-red-600 pb-8 mb-8">
            <div className={`w-24 mx-auto mb-6 p-1 ${headerBg}`}>
                <img src={data.avatarUrl} alt="Me" className={`w-full ${photoFrameStyle}`} />
            </div>
            <h1 className={`text-5xl font-black tracking-tighter mb-2 ${titleColor}`}>{data.fullName.toUpperCase()}</h1>
            <p className="text-2xl text-red-500 font-bold mb-4">{data.role}</p>
            <div className={`flex justify-center gap-4 text-xs font-sans ${subTextColor} flex-wrap`}>
              <span>{data.email}</span>|<span>{data.phone}</span>|<span className="break-all">{data.linkedin}</span>
              {data.portfolio && <>|<span className="break-all">{data.portfolio}</span></>}
            </div>
         </header>

         <div className="max-w-3xl mx-auto font-sans">
            <p className={`text-center mb-12 italic border-l-4 border-red-600 pl-4 py-2 ${quoteBg} ${subTextColor}`}>"{data.summary}"</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
               <div>
                  <h2 className={`text-red-500 font-black text-2xl mb-6 border-b pb-2 ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>EXPERIÊNCIA</h2>
                  <div className="space-y-8">
                    {data.experiences.map(exp => (
                       <div key={exp.id}>
                          <h3 className={`font-bold text-lg ${titleColor}`}>{exp.role}</h3>
                          <p className="text-red-600 text-sm font-bold mb-2">{exp.company}</p>
                          <p className={`text-xs mb-2 uppercase tracking-widest ${subTextColor}`}>{exp.period}</p>
                          <p className={`text-sm leading-relaxed ${mainTextColor}`}>{exp.description}</p>
                       </div>
                    ))}
                  </div>
               </div>
               <div>
                  <h2 className={`text-red-500 font-black text-2xl mb-6 border-b pb-2 ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>FORMAÇÃO</h2>
                  <div className="space-y-6">
                    {data.education.map(edu => (
                       <div key={edu.id}>
                          <h3 className={`font-bold ${titleColor}`}>{edu.degree}</h3>
                          <p className={`text-sm ${subTextColor}`}>{edu.institution}</p>
                          <span className="inline-block bg-red-600 text-white text-[10px] px-2 py-0.5 mt-1 font-bold">{edu.year}</span>
                       </div>
                    ))}
                  </div>

                  <h2 className={`text-red-500 font-black text-2xl mb-6 border-b pb-2 mt-12 ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>EXPERIÊNCIAS</h2>
                  <div className="flex flex-wrap gap-2">
                    {data.skills.map(s => (
                      <span key={s.id} className={`border border-red-600/50 px-3 py-1 text-sm hover:bg-red-600/20 transition-colors ${isDark ? 'text-red-100' : 'text-red-900'}`}>{s.name}</span>
                    ))}
                  </div>
                  
                  {/* IDIOMAS ADICIONADOS */}
                  <h2 className={`text-red-500 font-black text-2xl mb-6 border-b pb-2 mt-12 ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>IDIOMAS</h2>
                  <div className="flex flex-col gap-2">
                    {data.languages.map(l => (
                      <div key={l.id} className="flex justify-between items-center text-sm">
                         <span className={`${isDark ? 'text-red-100' : 'text-red-900'}`}>{l.name}</span>
                         <span className="text-xs bg-red-600/10 text-red-500 px-2 py-0.5 rounded font-bold">{l.level}</span>
                      </div>
                    ))}
                  </div>

                  <h2 className={`text-red-500 font-black text-2xl mb-6 border-b pb-2 mt-12 ${isDark ? 'border-neutral-700' : 'border-neutral-200'}`}>HOBBIES</h2>
                  <div className="flex flex-wrap gap-2">
                    {data.hobbies.map((h, i) => (
                      <span key={i} className={`text-xs ${subTextColor}`}>#{h}</span>
                    ))}
                  </div>
               </div>
            </div>
         </div>
      </div>
    );
  }

  // --- 4. GREEN (Eco Green) ---
  if (templateId === 'green') {
    // Light: Mint/White
    // Dark: Emerald-950/Emerald-900
    const bgClass = isDark ? "bg-emerald-950 text-emerald-100" : "bg-[#ecfdf5] text-emerald-900";
    const cardBg = isDark ? "bg-emerald-900/50 border-emerald-800" : "bg-white border-emerald-100";
    const highlightBg = isDark ? "bg-emerald-900" : "bg-emerald-900"; // Always dark for contrast block
    const titleColor = isDark ? "text-emerald-300" : "text-emerald-900";
    const subTextColor = isDark ? "text-emerald-400" : "text-emerald-700";
    const sectionTitleColor = isDark ? "text-emerald-200 border-emerald-700" : "text-emerald-900 border-emerald-200";

    return (
      <div className={`w-full p-8 md:p-12 font-sans ${bgClass}`}>
         <div className="flex flex-col md:flex-row gap-8 mb-12 items-center">
            <div className="w-24 overflow-hidden rounded-lg shadow-lg shadow-emerald-200/20">
                <img src={data.avatarUrl} className={`w-full ${photoFrameStyle}`} alt="Profile" />
            </div>
            <div>
               <h1 className={`text-4xl font-bold mb-1 ${isDark ? 'text-white' : 'text-emerald-950'}`}>{data.fullName}</h1>
               <p className="text-emerald-600 font-medium text-lg">{data.role}</p>
            </div>
         </div>
         
         <div className="grid grid-cols-3 gap-8">
            <div className="col-span-1 space-y-8">
               <div className={`p-6 rounded-xl shadow-sm border ${cardBg}`}>
                  <h3 className={`font-bold mb-4 flex items-center gap-2 ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}><span className="material-symbols-outlined">person</span> Perfil</h3>
                  <p className={`text-sm leading-relaxed ${subTextColor}`}>{data.summary}</p>
               </div>
               <div className={`p-6 rounded-xl shadow-sm border ${cardBg}`}>
                  <h3 className={`font-bold mb-4 ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>Experiências</h3>
                  {data.skills.map(s => (
                     <div key={s.id} className="mb-3 last:mb-0">
                        <p className="text-xs font-bold mb-1">{s.name}</p>
                        <div className={`w-full h-2 rounded-full ${isDark ? 'bg-emerald-800' : 'bg-emerald-100'}`}><div className="bg-emerald-500 h-2 rounded-full" style={{width: `${s.level}%`}}></div></div>
                     </div>
                  ))}
               </div>
               {/* IDIOMAS ADICIONADOS */}
               <div className={`p-6 rounded-xl shadow-sm border ${cardBg}`}>
                  <h3 className={`font-bold mb-4 ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>Idiomas</h3>
                  {data.languages.map(l => (
                     <div key={l.id} className="mb-2 flex justify-between items-center border-b border-emerald-500/10 pb-1 last:border-0">
                        <p className="text-xs font-bold">{l.name}</p>
                        <span className="text-[10px] text-emerald-500">{l.level}</span>
                     </div>
                  ))}
               </div>

               <div className={`${highlightBg} text-emerald-50 p-6 rounded-xl shadow-lg`}>
                  <h3 className="font-bold mb-4">Interesses</h3>
                  <div className="flex flex-wrap gap-1">
                      {data.hobbies.map((h,i) => <span key={i} className="text-xs bg-emerald-800 px-2 py-1 rounded">{h}</span>)}
                  </div>
               </div>
               <div className={`p-6 rounded-xl shadow-sm border ${cardBg}`}>
                  <h3 className={`font-bold mb-4 ${isDark ? 'text-emerald-200' : 'text-emerald-800'}`}>Contato</h3>
                  <p className="text-xs mb-2 truncate">{data.email}</p>
                  <p className="text-xs mb-2">{data.phone}</p>
                  <p className="text-xs break-all">{data.linkedin}</p>
                  <p className="text-xs break-all">{data.portfolio}</p>
               </div>
            </div>
            
            <div className="col-span-2 space-y-8">
               <section>
                  <h2 className={`text-2xl font-display font-bold mb-6 border-b-2 inline-block pb-1 ${sectionTitleColor}`}>Experiência</h2>
                  <div className="space-y-6">
                     {data.experiences.map(exp => (
                        <div key={exp.id} className="group">
                           <div className="flex justify-between items-baseline">
                              <h3 className={`font-bold text-xl group-hover:text-emerald-600 transition-colors ${titleColor}`}>{exp.role}</h3>
                              <span className="text-sm font-bold text-emerald-500">{exp.period}</span>
                           </div>
                           <p className="text-emerald-600 font-medium mb-2">{exp.company}</p>
                           <p className={`text-sm leading-relaxed ${isDark ? 'text-emerald-300/80' : 'text-emerald-800/70'}`}>{exp.description}</p>
                        </div>
                     ))}
                  </div>
               </section>
               <section>
                  <h2 className={`text-2xl font-display font-bold mb-6 border-b-2 inline-block pb-1 ${sectionTitleColor}`}>Educação</h2>
                   <div className="grid grid-cols-2 gap-4">
                     {data.education.map(edu => (
                        <div key={edu.id} className={`p-4 rounded-lg border ${cardBg}`}>
                           <h4 className={`font-bold ${titleColor}`}>{edu.degree}</h4>
                           <p className="text-sm text-emerald-600">{edu.institution}</p>
                           <p className="text-xs text-emerald-500 mt-1">{edu.year}</p>
                        </div>
                     ))}
                   </div>
               </section>
            </div>
         </div>
      </div>
    );
  }

  // --- 5. PURPLE (Royal Purple) ---
  if (templateId === 'purple') {
    // Light: Lavender/White
    // Dark: Indigo-950
    const bgClass = isDark ? "bg-[#1e1b4b] text-indigo-100" : "bg-indigo-50 text-indigo-900";
    const sidebarBg = isDark ? "bg-indigo-950/50 border-indigo-900" : "bg-white border-indigo-100 shadow-sm";
    const cardBg = isDark ? "bg-[#2e2a66] border-indigo-900/50" : "bg-white border-indigo-100 shadow-sm";
    const headerTitle = isDark ? "text-indigo-400" : "text-indigo-700";
    const roleColor = isDark ? "text-white" : "text-indigo-900";
    const sidebarTitle = isDark ? "text-indigo-400" : "text-indigo-600";
    const textMuted = isDark ? "text-indigo-300" : "text-indigo-500";
    
     return (
        <div className={`w-full p-8 font-sans ${bgClass}`}>
           <header className={`flex items-end justify-between border-b pb-6 mb-8 ${isDark ? 'border-indigo-800' : 'border-indigo-200'}`}>
              <div>
                 <h1 className={`text-5xl font-display font-bold ${headerTitle}`}>{data.fullName}</h1>
                 <p className={`text-2xl mt-2 ${roleColor}`}>{data.role}</p>
              </div>
              <div className={`text-right text-sm ${textMuted}`}>
                 <p>{data.email}</p>
                 <p>{data.phone}</p>
                 <p>{data.portfolio}</p>
              </div>
           </header>
           
           <div className="grid grid-cols-12 gap-8">
              <aside className={`col-span-4 p-6 rounded-2xl border h-fit ${sidebarBg}`}>
                 <div className="mb-8 text-center">
                    <div className="w-32 mx-auto border-4 border-indigo-500 mb-4 shadow-lg shadow-indigo-500/20 overflow-hidden rounded-lg">
                        <img src={data.avatarUrl} className={`w-full ${photoFrameStyle}`} alt="Me" />
                    </div>
                 </div>
                 <div className="mb-8">
                    <h3 className={`font-bold uppercase text-xs tracking-widest mb-3 ${sidebarTitle}`}>Sobre</h3>
                    <p className="text-sm leading-relaxed text-justify opacity-80">{data.summary}</p>
                 </div>
                 <div className="mb-8">
                    <h3 className={`font-bold uppercase text-xs tracking-widest mb-3 ${sidebarTitle}`}>Experiências</h3>
                    <div className="flex flex-wrap gap-2">
                       {data.skills.map(s => (
                          <span key={s.id} className={`px-3 py-1 rounded-full text-xs font-bold border ${isDark ? 'bg-indigo-900 text-indigo-200 border-indigo-700' : 'bg-indigo-100 text-indigo-700 border-indigo-200'}`}>{s.name}</span>
                       ))}
                    </div>
                 </div>
                 {/* IDIOMAS ADICIONADOS */}
                 <div className="mb-8">
                    <h3 className={`font-bold uppercase text-xs tracking-widest mb-3 ${sidebarTitle}`}>Idiomas</h3>
                    <ul className="space-y-2">
                       {data.languages.map(l => (
                          <li key={l.id} className="flex justify-between text-sm">
                              <span className="font-medium">{l.name}</span>
                              <span className={`text-xs ${textMuted}`}>{l.level}</span>
                          </li>
                       ))}
                    </ul>
                 </div>
                 <div>
                    <h3 className={`font-bold uppercase text-xs tracking-widest mb-3 ${sidebarTitle}`}>Hobbies</h3>
                    <div className={`flex flex-wrap gap-2 text-xs ${textMuted}`}>
                        {data.hobbies.map((h, i) => <span key={i}>• {h}</span>)}
                    </div>
                 </div>
              </aside>
              
              <main className="col-span-8 space-y-10">
                 <section>
                    <h2 className={`text-2xl font-bold mb-6 flex items-center gap-3 ${isDark ? 'text-white' : 'text-indigo-900'}`}><span className="w-8 h-1 bg-indigo-500 rounded-full"></span>Experiência</h2>
                    <div className="space-y-8">
                       {data.experiences.map(exp => (
                          <div key={exp.id} className={`p-6 rounded-xl border hover:border-indigo-500 transition-colors ${cardBg}`}>
                             <div className="flex justify-between mb-2">
                                <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-indigo-900'}`}>{exp.role}</h3>
                                <span className="text-indigo-400 text-sm font-mono">{exp.period}</span>
                             </div>
                             <p className="text-indigo-500 font-bold text-sm mb-3">{exp.company}</p>
                             <p className={`text-sm opacity-80`}>{exp.description}</p>
                          </div>
                       ))}
                    </div>
                 </section>
                 <section>
                    <h2 className={`text-2xl font-bold mb-6 flex items-center gap-3 ${isDark ? 'text-white' : 'text-indigo-900'}`}><span className="w-8 h-1 bg-indigo-500 rounded-full"></span>Educação</h2>
                    <div className="space-y-4">
                       {data.education.map(edu => (
                          <div key={edu.id} className={`flex justify-between items-center border-b pb-2 ${isDark ? 'border-indigo-900' : 'border-indigo-200'}`}>
                             <div>
                                <h4 className={`font-bold ${isDark ? 'text-white' : 'text-indigo-900'}`}>{edu.degree}</h4>
                                <p className={`text-sm ${textMuted}`}>{edu.institution}</p>
                             </div>
                             <span className="text-xs bg-indigo-600 px-2 py-1 rounded text-white">{edu.year}</span>
                          </div>
                       ))}
                    </div>
                 </section>
              </main>
           </div>
        </div>
     )
  }

  // --- 6. BLACK (Mono Black) ---
  if (templateId === 'black') {
    // Light: White BG, Black Text
    // Dark: Black BG, White Text
    const bgClass = isDark ? "bg-black text-white" : "bg-white text-black";
    const borderClass = isDark ? "border-white" : "border-black";
    const subText = isDark ? "text-neutral-400" : "text-neutral-600";
    const cardBg = isDark ? "bg-neutral-900" : "bg-neutral-100";
    const divider = isDark ? "border-neutral-700" : "border-neutral-300";

     return (
        <div className={`w-full p-12 font-sans ${bgClass}`}>
           <div className={`flex justify-between items-end mb-16 border-l-4 pl-8 ${borderClass}`}>
              <div>
                  <h1 className="text-6xl font-black uppercase tracking-tighter mb-2">{data.fullName}</h1>
                  <p className={`text-xl font-light tracking-widest uppercase ${subText}`}>{data.role}</p>
              </div>
              <div className={`w-32 hidden md:block border p-1 ${isDark ? 'border-neutral-700' : 'border-neutral-300'}`}>
                 <img src={data.avatarUrl} className={`w-full ${photoFrameStyle} grayscale`} alt="Me" />
              </div>
           </div>
           
           <div className="grid grid-cols-12 gap-12">
              <div className="col-span-8">
                 <h2 className={`text-3xl font-bold border-b-2 pb-2 mb-8 uppercase ${borderClass}`}>Experiência</h2>
                 <div className="space-y-12">
                    {data.experiences.map(exp => (
                       <div key={exp.id}>
                          <h3 className="text-2xl font-bold">{exp.role}</h3>
                          <p className={`text-lg mb-4 ${subText}`}>{exp.company} | {exp.period}</p>
                          <p className="leading-relaxed font-light opacity-90">{exp.description}</p>
                       </div>
                    ))}
                 </div>
                 
                 <h2 className={`text-3xl font-bold border-b-2 pb-2 mb-8 mt-12 uppercase ${borderClass}`}>Educação</h2>
                 <div className="grid grid-cols-2 gap-8">
                    {data.education.map(edu => (
                       <div key={edu.id}>
                          <h4 className="font-bold text-lg">{edu.degree}</h4>
                          <p className={subText}>{edu.institution} - {edu.year}</p>
                       </div>
                    ))}
                 </div>
              </div>
              
              <div className="col-span-4 space-y-12">
                 <div className={`p-6 ${cardBg}`}>
                    <h3 className={`font-bold text-xl mb-4 border-b pb-2 ${divider}`}>CONTATO</h3>
                    <p className={`text-sm mb-2 opacity-80`}>{data.email}</p>
                    <p className={`text-sm mb-2 opacity-80`}>{data.phone}</p>
                    <p className={`text-sm opacity-80 break-all`}>{data.linkedin}</p>
                    <p className={`text-sm opacity-80 break-all`}>{data.portfolio}</p>
                 </div>
                 
                 <div>
                    <h3 className={`font-bold text-xl mb-4 border-b pb-2 ${divider}`}>RESUMO</h3>
                    <p className={`text-sm leading-relaxed ${subText}`}>{data.summary}</p>
                 </div>
                 
                 <div>
                    <h3 className={`font-bold text-xl mb-4 border-b pb-2 ${divider}`}>EXPERIÊNCIAS</h3>
                    <ul className={`list-disc list-inside space-y-1 ${subText}`}>
                       {data.skills.map(s => <li key={s.id}>{s.name}</li>)}
                    </ul>
                 </div>

                 {/* IDIOMAS ADICIONADOS */}
                 <div>
                    <h3 className={`font-bold text-xl mb-4 border-b pb-2 ${divider}`}>IDIOMAS</h3>
                    <ul className={`space-y-2 ${subText}`}>
                       {data.languages.map(l => (
                          <li key={l.id} className="flex justify-between">
                             <span>{l.name}</span>
                             <span className="font-bold opacity-60">{l.level}</span>
                          </li>
                       ))}
                    </ul>
                 </div>

                 <div>
                    <h3 className={`font-bold text-xl mb-4 border-b pb-2 ${divider}`}>HOBBIES</h3>
                    <div className={`text-sm flex flex-wrap gap-2 ${subText}`}>
                        {data.hobbies.map((h, i) => <span key={i} className={`border px-2 py-1 ${divider}`}>{h}</span>)}
                    </div>
                 </div>
              </div>
           </div>
        </div>
     )
  }

  // --- 7. MAGENTA (Vivid Magenta) ---
  if (templateId === 'magenta') {
    // Light: White BG
    // Dark: Gray-950 BG
    const bgClass = isDark ? "bg-gray-950 text-gray-200" : "bg-white text-gray-900";
    const headerBg = isDark ? "bg-gray-900" : "bg-pink-50";
    const cardBg = isDark ? "bg-gray-900" : "bg-gray-50";
    const skillCardBg = isDark ? "bg-gray-800" : "bg-gray-900";
    const contactText = isDark ? "text-gray-300" : "text-gray-700";
    
     return (
        <div className={`w-full p-8 font-sans ${bgClass}`}>
           <header className={`flex justify-between items-center mb-12 p-8 rounded-3xl ${headerBg}`}>
              <div className="flex items-center gap-6">
                 <div className="w-24 rounded-2xl overflow-hidden border-2 border-pink-200">
                    <img src={data.avatarUrl} className={`w-full ${photoFrameStyle}`} alt="Me" />
                 </div>
                 <div>
                    <h1 className="text-5xl font-black text-pink-600 mb-2">{data.fullName}</h1>
                    <p className={`text-2xl font-bold ${contactText}`}>{data.role}</p>
                 </div>
              </div>
              <div className="text-right hidden md:block">
                 <div className="bg-pink-600 text-white font-bold px-6 py-2 rounded-full mb-2">{data.email}</div>
                 <div className="text-pink-600 font-bold">{data.phone}</div>
                 <div className="text-pink-600 font-bold text-sm mt-1">{data.portfolio}</div>
              </div>
           </header>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className={`col-span-1 md:col-span-2 lg:col-span-2 p-8 rounded-3xl ${cardBg}`}>
                 <h2 className="text-pink-600 font-black text-2xl mb-6 flex items-center gap-2"># EXPERIÊNCIA</h2>
                 <div className="space-y-8">
                    {data.experiences.map(exp => (
                       <div key={exp.id} className="relative pl-8 border-l-4 border-pink-200">
                          <div className="absolute -left-[10px] top-1 w-4 h-4 bg-pink-500 rounded-full"></div>
                          <h3 className="font-bold text-xl">{exp.role}</h3>
                          <div className="text-pink-500 font-bold text-sm mb-2">{exp.company} <span className="text-gray-400">•</span> {exp.period}</div>
                          <p className="opacity-80">{exp.description}</p>
                       </div>
                    ))}
                 </div>
              </div>
              
              <div className="space-y-6">
                 <div className="bg-pink-600 text-white p-8 rounded-3xl shadow-xl shadow-pink-500/20">
                    <h2 className="font-black text-xl mb-4 text-pink-100">RESUMO</h2>
                    <p className="text-sm font-medium leading-relaxed opacity-90">{data.summary}</p>
                 </div>
                 
                 <div className={`${skillCardBg} text-white p-8 rounded-3xl`}>
                    <h2 className="font-black text-xl mb-4 text-pink-500">EXPERIÊNCIAS</h2>
                    <div className="space-y-3">
                       {data.skills.map(s => (
                          <div key={s.id}>
                             <div className="flex justify-between text-xs font-bold mb-1">
                                <span>{s.name}</span>
                                <span className="text-pink-500">{s.level}%</span>
                             </div>
                             <div className="h-1 bg-gray-700 rounded-full"><div className="h-full bg-pink-500 rounded-full" style={{width: `${s.level}%`}}></div></div>
                          </div>
                       ))}
                    </div>
                 </div>

                 {/* IDIOMAS ADICIONADOS */}
                 <div className={`p-8 rounded-3xl border-2 border-pink-100 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-pink-50'}`}>
                    <h2 className="font-black text-xl mb-4 text-pink-600">IDIOMAS</h2>
                    <div className="space-y-2">
                        {data.languages.map(l => (
                            <div key={l.id} className="flex justify-between items-center text-sm font-bold opacity-80">
                                <span>{l.name}</span>
                                <span className="text-pink-500">{l.level}</span>
                            </div>
                        ))}
                    </div>
                 </div>

                 <div className={`p-8 rounded-3xl border-2 border-pink-100 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-pink-50'}`}>
                    <h2 className="font-black text-xl mb-4 text-pink-600">HOBBIES</h2>
                    <div className="flex flex-wrap gap-2">
                        {data.hobbies.map((h, i) => <span key={i} className={`px-2 py-1 rounded text-xs shadow-sm font-bold text-pink-400 ${isDark ? 'bg-gray-800' : 'bg-white'}`}>{h}</span>)}
                    </div>
                 </div>
                 
                 <div className={`p-8 rounded-3xl border-2 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                     <h2 className="font-black text-xl mb-4 text-pink-600">EDUCAÇÃO</h2>
                     {data.education.map(edu => (
                        <div key={edu.id} className="mb-4 last:mb-0">
                           <div className="font-bold">{edu.degree}</div>
                           <div className="text-xs opacity-60">{edu.institution}</div>
                        </div>
                     ))}
                 </div>
              </div>
           </div>
        </div>
     )
  }

  // --- 8. VIOLET (Deep Violet) ---
  if (templateId === 'violet') {
    // Light: White BG, Violet Text
    // Dark: Violet-950 BG, Violet-100 Text
    const bgClass = isDark ? "bg-[#2e1065] text-violet-100" : "bg-white text-violet-950";
    const frameBg = isDark ? "bg-[#2e1065]" : "bg-white";
    const border = isDark ? "border-violet-700" : "border-violet-200";
    const roleColor = isDark ? "text-violet-400" : "text-violet-600";
    const subText = isDark ? "text-violet-300" : "text-violet-800";
    const expRole = isDark ? "text-violet-200" : "text-violet-900";
    
     return (
        <div className={`w-full p-8 md:p-16 font-display ${bgClass}`}>
           <div className={`border p-8 relative ${border}`}>
              <div className={`absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-8 ${frameBg}`}>
                 <div className="w-24 rounded-full border-2 border-violet-500 overflow-hidden mx-auto">
                    <img src={data.avatarUrl} className={`w-full ${photoFrameStyle}`} alt="Avatar"/>
                 </div>
              </div>
              
              <div className="text-center mt-12 mb-16">
                 <h1 className={`text-4xl md:text-5xl font-bold mb-2 ${isDark ? 'text-white' : 'text-violet-950'}`}>{data.fullName}</h1>
                 <p className={`${roleColor} tracking-[0.3em] uppercase text-sm`}>{data.role}</p>
                 <p className={`${subText} mt-4 max-w-2xl mx-auto text-sm italic`}>"{data.summary}"</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                 <div className="text-right">
                    <h2 className={`text-2xl font-bold mb-8 ${isDark ? 'text-white' : 'text-violet-950'}`}>Experiência Profissional</h2>
                    <div className="space-y-8">
                       {data.experiences.map(exp => (
                          <div key={exp.id}>
                             <h3 className={`text-lg font-bold ${expRole}`}>{exp.role}</h3>
                             <p className="text-violet-500 text-xs font-bold mb-2 uppercase">{exp.company}</p>
                             <p className={`text-sm leading-relaxed ${isDark ? 'text-violet-300/80' : 'text-violet-700'}`}>{exp.description}</p>
                          </div>
                       ))}
                    </div>
                 </div>
                 
                 <div className={`border-l pl-16 ${isDark ? 'border-violet-800' : 'border-violet-100'}`}>
                    <h2 className={`text-2xl font-bold mb-8 ${isDark ? 'text-white' : 'text-violet-950'}`}>Educação & Experiências</h2>
                    <div className="space-y-6 mb-12">
                       {data.education.map(edu => (
                          <div key={edu.id}>
                             <h4 className={`font-bold ${expRole}`}>{edu.degree}</h4>
                             <p className="text-sm text-violet-500">{edu.institution}</p>
                          </div>
                       ))}
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-8">
                       {data.skills.map(s => (
                          <span key={s.id} className="text-xs border border-violet-600 px-2 py-1 text-violet-500 font-bold">{s.name}</span>
                       ))}
                    </div>

                    {/* IDIOMAS ADICIONADOS */}
                    <h3 className="text-violet-400 font-bold text-sm mb-2">Idiomas</h3>
                    <div className="flex flex-col gap-1 mb-8">
                       {data.languages.map(l => (
                          <div key={l.id} className="text-sm flex gap-2">
                              <span className="font-bold">{l.name}:</span>
                              <span className={subText}>{l.level}</span>
                          </div>
                       ))}
                    </div>

                    <h3 className="text-violet-400 font-bold text-sm mb-2">Interesses</h3>
                    <div className="flex flex-wrap gap-2 mb-8">
                       {data.hobbies.map((h,i) => <span key={i} className="text-xs text-violet-500">{h}</span>)}
                    </div>
                    
                    <div className={`mt-12 pt-8 border-t text-sm space-y-1 ${isDark ? 'border-violet-800 text-violet-400' : 'border-violet-100 text-violet-600'}`}>
                       <p>{data.email}</p>
                       <p>{data.phone}</p>
                       <p>{data.portfolio}</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
     )
  }

  // --- 9. GRAY (Minimal Gray) ---
  if (templateId === 'gray') {
    // Light: Stone-50 / Stone-800
    // Dark: Stone-900 / Stone-200
    const bgClass = isDark ? "bg-stone-900 text-stone-300" : "bg-[#f5f5f4] text-[#44403c]";
    const headerTitle = isDark ? "text-stone-100" : "text-[#1c1917]";
    const divider = isDark ? "bg-stone-700" : "bg-[#a8a29e]";
    const photoBorder = isDark ? "border-stone-700 bg-stone-800" : "border-stone-300 bg-white";
    const sectionTitle = isDark ? "text-stone-100" : "text-[#1c1917]";
    const subText = isDark ? "text-stone-400" : "text-[#57534e]";
    const borderL = isDark ? "border-stone-800" : "border-[#e7e5e4]";
    
     return (
        <div className={`w-full p-12 font-sans ${bgClass}`}>
           <header className="mb-16 flex gap-8 items-center">
              <div className={`w-24 border p-1 ${photoBorder}`}>
                <img src={data.avatarUrl} className={`w-full ${photoFrameStyle}`} alt="Me" />
              </div>
              <div>
                <h1 className={`text-4xl font-light mb-2 ${headerTitle}`}>{data.fullName}</h1>
                <div className={`w-24 h-1 mb-4 ${divider}`}></div>
                <p className={`text-lg uppercase tracking-wide ${isDark ? 'text-stone-500' : 'text-[#78716c]'}`}>{data.role}</p>
              </div>
           </header>
           
           <div className="grid grid-cols-12 gap-8">
              <aside className="col-span-3 text-sm space-y-8">
                 <div>
                    <h3 className={`font-bold mb-2 uppercase text-xs ${sectionTitle}`}>Contato</h3>
                    <p className={`${subText} mb-1`}>{data.email}</p>
                    <p className={`${subText} mb-1`}>{data.phone}</p>
                    <p className={`${subText} break-all`}>{data.linkedin}</p>
                    <p className={`${subText} break-all`}>{data.portfolio}</p>
                 </div>
                 
                 <div>
                    <h3 className={`font-bold mb-2 uppercase text-xs ${sectionTitle}`}>Experiências</h3>
                    <ul className={`space-y-1 ${subText}`}>
                       {data.skills.map(s => <li key={s.id}>{s.name}</li>)}
                    </ul>
                 </div>

                 {/* IDIOMAS ADICIONADOS */}
                 <div>
                    <h3 className={`font-bold mb-2 uppercase text-xs ${sectionTitle}`}>Idiomas</h3>
                    <ul className={`space-y-1 ${subText}`}>
                       {data.languages.map(l => (
                           <li key={l.id} className="flex flex-col">
                               <span className="font-bold">{l.name}</span>
                               <span className="text-xs opacity-80">{l.level}</span>
                           </li>
                       ))}
                    </ul>
                 </div>

                 <div>
                    <h3 className={`font-bold mb-2 uppercase text-xs ${sectionTitle}`}>Hobbies</h3>
                    <ul className={`space-y-1 ${subText}`}>
                       {data.hobbies.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                 </div>

                  <div>
                    <h3 className={`font-bold mb-2 uppercase text-xs ${sectionTitle}`}>Educação</h3>
                    {data.education.map(edu => (
                       <div key={edu.id} className="mb-3">
                          <p className={`font-bold ${isDark ? 'text-stone-300' : 'text-[#44403c]'}`}>{edu.degree}</p>
                          <p className={`text-xs ${isDark ? 'text-stone-500' : 'text-[#78716c]'}`}>{edu.year}</p>
                       </div>
                    ))}
                 </div>
              </aside>
              
              <main className={`col-span-9 pl-8 border-l ${borderL}`}>
                 <section className="mb-12">
                    <h2 className={`text-xl font-bold mb-6 uppercase tracking-wider ${sectionTitle}`}>Perfil</h2>
                    <p className={`${subText} leading-relaxed max-w-2xl`}>{data.summary}</p>
                 </section>
                 
                 <section>
                    <h2 className={`text-xl font-bold mb-6 uppercase tracking-wider ${sectionTitle}`}>Experiência</h2>
                    <div className="space-y-10">
                       {data.experiences.map(exp => (
                          <div key={exp.id}>
                             <div className="flex justify-between items-baseline mb-2">
                                <h3 className={`text-lg font-bold ${headerTitle}`}>{exp.role}</h3>
                                <span className={`text-xs font-bold px-2 py-1 ${isDark ? 'bg-stone-800 text-stone-400' : 'bg-[#e7e5e4] text-[#57534e]'}`}>{exp.period}</span>
                             </div>
                             <p className={`font-medium text-sm mb-3 uppercase tracking-wide ${isDark ? 'text-stone-500' : 'text-[#a8a29e]'}`}>{exp.company}</p>
                             <p className={`${subText} leading-relaxed`}>{exp.description}</p>
                          </div>
                       ))}
                    </div>
                 </section>
              </main>
           </div>
        </div>
     )
  }

  // --- 10. LILAC (Soft Lilac) ---
  if (templateId === 'lilac') {
    // Light: White BG
    // Dark: Purple-950 BG
    const bgClass = isDark ? "bg-slate-900 text-slate-200" : "bg-white text-slate-700";
    const cardBg = isDark ? "bg-[#2e1065]" : "bg-purple-100";
    const headerTitle = isDark ? "text-purple-200" : "text-purple-900";
    const roleColor = isDark ? "text-purple-400" : "text-purple-600";
    const summaryBg = isDark ? "bg-slate-800 text-purple-200" : "bg-white text-purple-800/80";
    const subCardBg = isDark ? "bg-purple-900/40" : "bg-purple-50";
    const contactBg = isDark ? "bg-slate-800 border-purple-900" : "bg-white border-purple-100";
    const eduBg = isDark ? "bg-purple-900" : "bg-purple-600";
    
     return (
        <div className={`w-full p-6 font-display ${bgClass}`}>
           <div className={`rounded-[2rem] p-8 md:p-12 ${cardBg}`}>
              <header className="flex items-center gap-6 mb-12">
                 <div className="w-24 rounded-2xl overflow-hidden border-2 border-purple-200">
                    <img src={data.avatarUrl} className={`w-full ${photoFrameStyle}`} alt="Me" />
                 </div>
                 <div>
                    <h1 className={`text-3xl font-bold ${headerTitle}`}>{data.fullName}</h1>
                    <p className={`${roleColor} font-medium`}>{data.role}</p>
                 </div>
              </header>
              
              <div className={`rounded-3xl p-8 shadow-sm mb-8 ${summaryBg}`}>
                 <p className="text-center italic text-lg leading-relaxed">"{data.summary}"</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-4">
                    <div className={`p-6 rounded-2xl ${subCardBg}`}>
                       <h2 className={`font-bold text-xl mb-4 ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>Experiência</h2>
                       <div className="space-y-6">
                          {data.experiences.map(exp => (
                             <div key={exp.id}>
                                <h3 className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{exp.role}</h3>
                                <p className="text-sm text-purple-500 mb-1">{exp.company}</p>
                                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{exp.description}</p>
                             </div>
                          ))}
                       </div>
                    </div>
                 </div>
                 
                 <div className="space-y-4">
                    <div className={`p-6 rounded-2xl border ${contactBg}`}>
                        <h2 className={`font-bold text-xl mb-4 ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>Detalhes & Hobbies</h2>
                        <div className="space-y-2 text-sm mb-4">
                           <p><strong>Email:</strong> {data.email}</p>
                           <p><strong>Tel:</strong> {data.phone}</p>
                           <p><strong>Port:</strong> {data.portfolio}</p>
                        </div>
                        
                        {/* IDIOMAS ADICIONADOS */}
                        <div className="mb-4">
                             <p className={`font-bold mb-2 ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>Idiomas:</p>
                             <div className="flex flex-wrap gap-2">
                                {data.languages.map(l => (
                                    <span key={l.id} className="text-xs bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">{l.name} - {l.level}</span>
                                ))}
                             </div>
                        </div>

                        <p className={`font-bold mb-2 ${isDark ? 'text-purple-300' : 'text-purple-800'}`}>Hobbies:</p>
                        <div className="flex flex-wrap gap-2">
                            {data.hobbies.map((h, i) => <span key={i} className={`text-xs px-2 py-1 rounded-full ${isDark ? 'bg-purple-900 text-purple-300' : 'bg-purple-50 text-purple-600'}`}>{h}</span>)}
                        </div>
                    </div>
                    
                    <div className={`p-6 rounded-2xl text-white ${eduBg}`}>
                        <h2 className="font-bold text-xl mb-4 text-purple-100">Educação</h2>
                        {data.education.map(edu => (
                           <div key={edu.id} className="mb-2">
                              <p className="font-bold">{edu.degree}</p>
                              <p className="text-xs text-purple-200">{edu.institution}</p>
                           </div>
                        ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
     )
  }

  // Fallback to original if ID not found
  return null; 
};

export default ResumePreview;