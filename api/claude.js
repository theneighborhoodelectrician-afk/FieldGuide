<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#111318" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>FieldGuide — Electrical Estimating</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800;900&family=Barlow+Condensed:wght@700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #111318; color: #EDF2F7; font-family: 'Barlow', system-ui, sans-serif; -webkit-font-smoothing: antialiased; overscroll-behavior: none; }
    textarea { color-scheme: dark; font-family: 'Barlow', system-ui, sans-serif; }
    textarea::placeholder { color: #3D4459; }
    button { font-family: 'Barlow', system-ui, sans-serif; cursor: pointer; transition: filter 0.15s, transform 0.1s; }
    button:hover { filter: brightness(1.08); }
    button:active { transform: scale(0.97) !important; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: #111318; }
    ::-webkit-scrollbar-thumb { background: #262B38; border-radius: 4px; }
    @keyframes spin    { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
    @keyframes blink   { 0%,100%{opacity:1}50%{opacity:0.3} }
    @keyframes fadeUp  { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
    @keyframes recPulse {
      0%,100%{ box-shadow:0 0 0 0 rgba(255,71,87,0.5),0 0 20px rgba(255,71,87,0.3); }
      50%    { box-shadow:0 0 0 16px rgba(255,71,87,0),0 0 32px rgba(255,71,87,0.5); }
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="importmap">
    { "imports": { "react": "https://esm.sh/react@18.2.0", "react-dom/client": "https://esm.sh/react-dom@18.2.0/client" } }
  </script>
  <script type="module">
    import React, { useState, useRef, useEffect } from "react";
    import { createRoot } from "react-dom/client";

    // ── Default Field Intelligence Rules ─────────────────────────
    const DEFAULT_RULES = [
      { id: 1, trigger: "oxidation on breaker or main breaker", result: "Full panel replacement + service upgrade + outside disconnect + new ground system + permits required" },
      { id: 2, trigger: "rust inside panel or water damage in panel", result: "Full panel replacement + service upgrade + outside disconnect + new ground system + permits required" },
      { id: 3, trigger: "Federal Pacific, Stab-Lok, FPE, Zinsco, Pushmatic, or GE panel", result: "Known unsafe panel — full replacement required + outside service upgrade + new ground system" },
      { id: 4, trigger: "fuse box or fuse panel", result: "Unsafe — full panel upgrade required + outside service + new ground system + permits" },
      { id: 5, trigger: "double tapped breakers and panel is under 150 amps", result: "Full new service upgrade required + outside disconnect + new ground system + permits" },
      { id: 6, trigger: "double tapped breakers and panel is 150 amps or above", result: "Offer sub-panel installation OR full new service upgrade + outside disconnect + new ground system + permits" },
      { id: 7, trigger: "panel is full with no open breakers and does not accept tandem breakers, panel under 150 amps", result: "Full new service upgrade required + outside disconnect + new ground system + permits" },
      { id: 8, trigger: "panel is full with no open breakers and does not accept tandem breakers, panel 150 amps or above", result: "Offer sub-panel installation OR full new service upgrade" },
      { id: 9, trigger: "panel is full with no open breakers but accepts tandem breakers", result: "Offer tandem breaker installation as a solution" },
      { id: 10, trigger: "any panel upgrade", result: "Always includes: new ground system + in most cases outside service upgrade + permits required" },
      { id: 11, trigger: "permit pulled for panel upgrade", result: "Outside disconnect is required by code" },
      { id: 12, trigger: "aluminum wiring on branch circuits (not ranges, dryers, or AC units)", result: "Must replace wiring OR install CO/ALR rated devices at every location" },
      { id: 13, trigger: "ungrounded outlets or two-prong outlets", result: "Offer GFCI protection at each location OR GFCI breaker in panel for those circuits" },
      { id: 14, trigger: "no GFCI protection in bathroom, kitchen, garage, or exterior", result: "Separate line item: GFCI protection required at all wet and exterior locations" },
      { id: 15, trigger: "knob and tube wiring", result: "Only two options: leave it completely alone OR full house rewire — no middle ground" },
      { id: 16, trigger: "home built before 1980 or older home", result: "Flag for: bad panel brands (GE/Pushmatic/Zinsco/FPE), grounding system check (likely tied to water pipe now PEX = no continuity), aluminum grounds to water pipe that oxidize, outdated smoke detectors, outlet and GFCI condition check" },
      { id: 17, trigger: "grounding system tied to water pipe or PEX plumbing", result: "Ground system has lost continuity — new ground system required" },
      { id: 18, trigger: "aluminum grounds to water pipe", result: "Oxidation risk — recommend replacing ground connections" },
      { id: 19, trigger: "EV charger request", result: "Always perform load calculation first — only recommend panel upgrade if load calc shows panel cannot handle it" },
      { id: 20, trigger: "no smoke detectors or outdated smoke detectors", result: "Recommend: wired smoke/carbon detector in basement + wireless smoke in each bedroom + wireless combo smoke/carbon on all other floors" },
      { id: 21, trigger: "any job", result: "Always offer whole-home surge protection as an enhancement on every job" },
    ];

    // ── Load/Save rules from localStorage ────────────────────────
    function loadRules() {
      try {
        const saved = localStorage.getItem("fieldguide_rules");
        return saved ? JSON.parse(saved) : DEFAULT_RULES;
      } catch(e) { return DEFAULT_RULES; }
    }
    function saveRules(rules) {
      try { localStorage.setItem("fieldguide_rules", JSON.stringify(rules)); } catch(e) {}
    }

    // ── Build master electrician system prompt ────────────────────
    function buildSystemPrompt(rules, section) {
      const rulesText = rules.map(r => `- IF you observe: "${r.trigger}" → THEN include: "${r.result}"`).join("\n");

      const sectionPrompts = {
        request: `Extract what the customer specifically asked for. Return requested_scopes array.`,
        safety: `Analyze safety observations. Apply ALL Field Intelligence rules below. Return safety_scopes array with FULL expanded scopes based on what was observed — not just what was literally said. Think like a master electrician interpreting field conditions.`,
        enhancements: `Extract upgrade and enhancement opportunities. Always include whole-home surge protection. Return enhancement_scopes array.`,
      };

      return `You are a master electrician with 30 years of experience helping field technicians build accurate estimates. You think beyond what is literally said — you interpret field observations and know exactly what they mean in terms of real scope of work.

FIELD INTELLIGENCE RULES — Apply these automatically when observations match:
${rulesText}

YOUR JOB FOR THIS SECTION:
${sectionPrompts[section]}

CRITICAL RULES:
- When a tech mentions an observation that matches a Field Intelligence rule, automatically expand it into the full scope of work
- Never just transcribe what was said — interpret what it MEANS
- If panel work is triggered, always check if outside service, ground system, and permits are needed
- If a home is pre-1980, apply all relevant age-based checks
- Always think: "What does a master electrician know that this observation implies?"

Return ONLY valid JSON, no markdown:
${section === "request" ? '{"requested_scopes":["scope 1","scope 2"],"job_facts":{"location":"where","quantity":"how many","panel_condition":"describe panel","structural_conditions":["notes"],"home_age":"estimated age if mentioned"}}' : ""}
${section === "safety" ? '{"safety_scopes":["full expanded scope 1","full expanded scope 2"],"job_facts":{"panel_condition":"panel condition and brand","safety_risks":["risk 1","risk 2"],"urgency":"immediate / soon / monitor","triggers_panel_upgrade":true,"triggers_service_upgrade":true,"requires_permits":true}}' : ""}
${section === "enhancements" ? '{"enhancement_scopes":["enhancement 1","enhancement 2"],"future_opportunities":["future 1"]}' : ""}`;
    }

    // ── API Call ──────────────────────────────────────────────────
    async function callClaude(systemPrompt, userText) {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: userText }]
      };
      if (systemPrompt) body.system = systemPrompt;
      try {
        const res = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        const data = JSON.parse(text);
        if (data.error) { console.error("API ERROR:", data.error); return null; }
        const raw = data.content?.[0]?.text || "{}";
        return JSON.parse(raw.replace(/```json|```/g, "").trim());
      } catch(e) {
        console.error("FAILED:", e);
        return null;
      }
    }

    const buildOptionsPrompt = (scopes, rules) => {
      const rulesText = rules.slice(0, 10).map(r => `- ${r.trigger} → ${r.result}`).join("\n");
      return `You are a master electrician helping a technician build honest estimate options for a homeowner. You are an advisor, not a salesman.

Available scopes:
- What customer asked for: ${JSON.stringify(scopes.requested)}
- Safety items found: ${JSON.stringify(scopes.safety)}
- Upgrade ideas: ${JSON.stringify(scopes.enhancements)}

Key electrical rules to respect when building options:
${rulesText}

Create exactly 6 estimate options that combine these scopes logically. Each option should feel like genuine professional advice.

Rules:
- NEVER invent pricing or dollar amounts
- If panel upgrade is included, always include ground system and likely service upgrade
- If permits are required, note that in the option
- List specific scope items per option
- Give each a warm clear name
- Value statement = what this does for the customer and their family

Return ONLY valid JSON:
{"options":[{"number":1,"name":"Option name","tier":"essential|safety|comfort|recommended|enhanced|complete","includes":["item 1","item 2"],"permits_required":false,"value_statement":"What this means for your home"}]}`;
    };

    // ── Colors ────────────────────────────────────────────────────
    const C = {
      bg:"#111318", bgCard:"#1A1D26", bgInner:"#13151C", border:"#262B38",
      cyan:"#00C2E0", cyanSoft:"#003D47",
      amber:"#F59E0B", amberSoft:"#3D2800",
      green:"#00C97A", greenSoft:"#003320",
      red:"#FF4757", redSoft:"rgba(255,71,87,0.12)",
      blue:"#3B82F6", violet:"#7C3AED", teal:"#0D9488",
      orange:"#EA580C", rose:"#E11D48", lime:"#65A30D",
      indigo:"#4F46E5", sky:"#0284C7", emerald:"#059669", fuchsia:"#C026D3",
      white:"#FFFFFF", bright:"#EDF2F7", mid:"#7A8599", dim:"#3D4459",
    };

    const SCOPE_COLORS  = [C.blue,C.violet,C.teal,C.orange,C.rose,C.lime,C.indigo,C.sky,C.emerald,C.fuchsia];
    const OPTION_COLORS = [C.blue,C.teal,C.violet,C.amber,C.green,C.indigo];
    const STEPS = ["request","safety","enhancements","review","options"];

    const STEP_META = {
      request: {
        num:1, label:"Their Request", short:"Request", emoji:"🏠",
        color:C.cyan, soft:C.cyanSoft,
        question:"What did the customer call you to do today?",
        sub:"What did they ask for — in their own words",
        placeholder:"e.g. 6 recessed lights in the living room, outlets in the garage aren't working, want an EV charger...",
      },
      safety: {
        num:2, label:"What You See", short:"Safety", emoji:"⚡",
        color:C.amber, soft:C.amberSoft,
        question:"What did you find when you got there?",
        sub:"Describe what you see — the AI knows what it means",
        placeholder:"e.g. panel has oxidation on the main breaker, looks like original from the 70s, saw some aluminum wiring, no GFCI in bathrooms, fuse box in the basement...",
      },
      enhancements: {
        num:3, label:"Good Ideas", short:"Upgrades", emoji:"💡",
        color:C.green, soft:C.greenSoft,
        question:"If this were your house, what would you add?",
        sub:"Genuine advice — things that would improve their life",
        placeholder:"e.g. dimmers on all switches, under cabinet lighting, smart switches, already mentioned surge protection...",
      },
    };

    const TIER_LABEL = {
      essential:"Just What They Asked", safety:"Safety First",
      comfort:"Added Comfort", recommended:"★ Recommended",
      enhanced:"Enhanced Home", complete:"The Complete Picture",
    };

    const h = React.createElement;

    // ── Scope Card ────────────────────────────────────────────────
    function ScopeCard({text, index, onRemove, onFlag, flagged}) {
      const bg = SCOPE_COLORS[index % SCOPE_COLORS.length];
      return h("div",{style:{display:"flex",alignItems:"center",background:flagged?"#2A1A1A":bg,borderRadius:14,marginBottom:8,overflow:"hidden",boxShadow:flagged?`0 4px 16px ${C.red}44`:`0 4px 16px ${bg}44`,animation:"fadeUp 0.25s ease both",animationDelay:`${index*0.05}s`,border:flagged?`2px solid ${C.red}`:"2px solid transparent"}},
        h("div",{style:{width:52,height:52,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.15)",fontSize:18,color:C.white}},flagged?"🚩":"◈"),
        h("div",{style:{flex:1,padding:"0 12px",fontSize:14,fontWeight:700,color:C.white,lineHeight:1.3}},text),
        h("div",{style:{display:"flex",flexDirection:"column"}},
          onFlag && h("div",{onClick:onFlag,title:"Flag as incorrect",style:{width:52,height:26,display:"flex",alignItems:"center",justifyContent:"center",background:flagged?"rgba(255,71,87,0.3)":"rgba(255,255,255,0.08)",cursor:"pointer",fontSize:14}},flagged?"✓":"🚩"),
          onRemove && h("div",{onClick:onRemove,style:{width:52,height:26,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(255,255,255,0.12)",cursor:"pointer",fontSize:18,color:C.white,fontWeight:300}},"×")
        )
      );
    }

    // ── Step Header ───────────────────────────────────────────────
    function StepHeader({current, onReset, onIntelligence}) {
      const steps=[{key:"request",label:"Request",color:C.cyan},{key:"safety",label:"Field",color:C.amber},{key:"enhancements",label:"Upgrades",color:C.green},{key:"review",label:"Review",color:C.cyan},{key:"options",label:"Options",color:C.cyan}];
      const idx = STEPS.indexOf(current);
      return h("div",{style:{background:C.bgCard,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:100,boxShadow:"0 4px 24px rgba(0,0,0,0.5)"}},
        h("div",{style:{height:3,background:`linear-gradient(90deg,${C.cyan},${C.amber},${C.green},${C.cyan})`}}),
        h("div",{style:{maxWidth:480,margin:"0 auto",padding:"14px 18px 0"}},
          h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
            h("div",{style:{display:"flex",alignItems:"center",gap:10}},
              h("div",{style:{width:38,height:38,borderRadius:10,background:`${C.cyan}22`,border:`1px solid ${C.cyan}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}},"🧭"),
              h("div",null,
                h("div",{style:{fontSize:20,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:2,lineHeight:1}},"FIELD",h("span",{style:{color:C.cyan}},"GUIDE")),
                h("div",{style:{fontSize:9,color:C.mid,textTransform:"uppercase",letterSpacing:2,fontWeight:600}},"Electrical Estimating")
              )
            ),
            h("div",{style:{display:"flex",gap:8,alignItems:"center"}},
              h("button",{onClick:onIntelligence,style:{background:`${C.amber}18`,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"6px 11px",fontSize:11,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:0.8}},"🧠 Rules"),
              current !== "request" && h("button",{onClick:onReset,style:{background:C.bgInner,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 13px",fontSize:11,fontWeight:700,color:C.mid,textTransform:"uppercase",letterSpacing:0.8}},"+ New"),
              h("div",{style:{display:"flex",alignItems:"center",gap:5,background:`${C.green}18`,border:`1px solid ${C.green}44`,borderRadius:8,padding:"6px 12px",fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1.2}},
                h("span",{style:{width:5,height:5,borderRadius:"50%",background:C.green,display:"inline-block",animation:"blink 2s infinite"}}),
                "Live"
              )
            )
          ),
          h("div",{style:{display:"flex",gap:6,paddingBottom:14,overflowX:"auto"}},
            steps.map((s,i)=>{
              const done=i<idx, active=i===idx;
              return h("div",{key:s.key,style:{display:"flex",alignItems:"center",gap:6,background:active?`${s.color}22`:done?`${s.color}14`:C.bgInner,border:`1.5px solid ${active?s.color:done?s.color+"55":C.border}`,borderRadius:100,padding:"6px 12px",whiteSpace:"nowrap",flexShrink:0,boxShadow:active?`0 0 12px ${s.color}44`:"none",transition:"all 0.3s"}},
                h("div",{style:{width:18,height:18,borderRadius:"50%",background:active?s.color:done?s.color+"cc":C.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,color:C.bg,flexShrink:0}},done?"✓":i+1),
                h("span",{style:{fontSize:11,fontWeight:700,color:active?s.color:done?s.color+"cc":C.mid,textTransform:"uppercase",letterSpacing:0.8}},s.label)
              );
            })
          )
        )
      );
    }

    // ── Field Intelligence Screen ─────────────────────────────────
    function IntelligenceScreen({rules, onBack, onSave}) {
      const [localRules, setLocalRules] = useState(rules);
      const [editing, setEditing]       = useState(null);
      const [newTrigger, setNewTrigger] = useState("");
      const [newResult, setNewResult]   = useState("");
      const [showAdd, setShowAdd]       = useState(false);

      const addRule = () => {
        if(!newTrigger.trim()||!newResult.trim()) return;
        const rule = { id: Date.now(), trigger: newTrigger.trim(), result: newResult.trim() };
        const updated = [...localRules, rule];
        setLocalRules(updated);
        setNewTrigger(""); setNewResult(""); setShowAdd(false);
        onSave(updated);
      };

      const deleteRule = (id) => {
        const updated = localRules.filter(r=>r.id!==id);
        setLocalRules(updated); onSave(updated);
      };

      return h("div",{style:{minHeight:"100vh",background:C.bg}},
        h("div",{style:{background:C.bgCard,borderBottom:`1px solid ${C.border}`,padding:"16px 18px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100}},
          h("div",{style:{height:3,background:`linear-gradient(90deg,${C.amber},${C.amber}44)`,position:"absolute",top:0,left:0,right:0}}),
          h("button",{onClick:onBack,style:{background:C.bgInner,border:`1px solid ${C.border}`,borderRadius:8,padding:"7px 13px",fontSize:13,fontWeight:700,color:C.mid,marginTop:3}},"← Back"),
          h("div",null,
            h("div",{style:{fontSize:18,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}},"🧠 Field Intelligence"),
            h("div",{style:{fontSize:10,color:C.amber,textTransform:"uppercase",letterSpacing:2,fontWeight:700}},"Electrical Rules Engine")
          )
        ),

        h("div",{style:{maxWidth:480,margin:"0 auto",padding:"20px 16px 48px"}},
          h("div",{style:{background:`${C.amber}12`,border:`1px solid ${C.amber}33`,borderRadius:14,padding:"14px 16px",marginBottom:20}},
            h("div",{style:{fontSize:13,color:C.amber,fontWeight:600,lineHeight:1.6}},"These rules teach FieldGuide to think like a master electrician. When a tech describes what they see, the AI applies these rules to expand observations into full scopes of work."),
          ),

          // Add new rule
          h("button",{onClick:()=>setShowAdd(!showAdd),style:{width:"100%",background:showAdd?C.bgRaised:`${C.green}18`,border:`1px solid ${showAdd?C.border:C.green}`,borderRadius:12,padding:"13px",fontSize:14,fontWeight:700,color:showAdd?C.mid:C.green,marginBottom:16,textTransform:"uppercase",letterSpacing:0.8}},
            showAdd?"Cancel":"+ Add New Rule"
          ),

          showAdd && h("div",{style:{background:C.bgCard,border:`1px solid ${C.green}33`,borderRadius:14,padding:16,marginBottom:16,animation:"fadeUp 0.2s ease"}},
            h("div",{style:{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}},"When tech sees or mentions..."),
            h("textarea",{value:newTrigger,onChange:e=>setNewTrigger(e.target.value),placeholder:"e.g. double tapped breakers on a 200 amp panel",style:{width:"100%",minHeight:70,background:C.bgInner,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",fontSize:13,color:C.bright,resize:"vertical",outline:"none",marginBottom:12,caretColor:C.green},onFocus:e=>e.target.style.borderColor=C.green,onBlur:e=>e.target.style.borderColor=C.border}),
            h("div",{style:{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}},"The AI should include..."),
            h("textarea",{value:newResult,onChange:e=>setNewResult(e.target.value),placeholder:"e.g. Offer sub-panel installation as an option since panel is 150A+",style:{width:"100%",minHeight:70,background:C.bgInner,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",fontSize:13,color:C.bright,resize:"vertical",outline:"none",marginBottom:12,caretColor:C.green},onFocus:e=>e.target.style.borderColor=C.green,onBlur:e=>e.target.style.borderColor=C.border}),
            h("button",{onClick:addRule,style:{width:"100%",background:C.green,color:C.bg,border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:900,letterSpacing:0.8,textTransform:"uppercase",boxShadow:`0 4px 16px ${C.green}44`}},"Save Rule")
          ),

          // Rules list
          h("div",{style:{fontSize:11,fontWeight:700,color:C.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:12}},`${localRules.length} Active Rules`),
          localRules.map((rule,i)=>
            h("div",{key:rule.id,style:{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,marginBottom:10,overflow:"hidden",animation:"fadeUp 0.2s ease both",animationDelay:`${i*0.03}s`}},
              h("div",{style:{padding:"12px 14px",borderBottom:`1px solid ${C.border}`}},
                h("div",{style:{fontSize:10,fontWeight:700,color:C.amber,textTransform:"uppercase",letterSpacing:1.2,marginBottom:5}},"When tech sees..."),
                h("div",{style:{fontSize:13,color:C.bright,fontWeight:600,lineHeight:1.4}},rule.trigger)
              ),
              h("div",{style:{padding:"12px 14px",background:`${C.green}08`}},
                h("div",{style:{fontSize:10,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:1.2,marginBottom:5}},"AI includes..."),
                h("div",{style:{fontSize:13,color:C.mid,lineHeight:1.4}},rule.result)
              ),
              h("div",{style:{padding:"8px 14px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end"}},
                h("button",{onClick:()=>deleteRule(rule.id),style:{background:"rgba(255,71,87,0.12)",border:`1px solid ${C.red}33`,borderRadius:6,padding:"4px 12px",fontSize:11,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:0.8}},"Remove")
              )
            )
          )
        )
      );
    }

    // ── Input Step ────────────────────────────────────────────────
    function InputStep({meta, onDone, saved, rules}) {
      const [text,setText]       = useState(saved?.text||"");
      const [mode,setMode]       = useState("type");
      const [isRec,setIsRec]     = useState(false);
      const [analyzing,setAna]   = useState(false);
      const [extracted,setExt]   = useState(saved?.extracted||null);
      const [error,setError]     = useState(null);
      const [flagged,setFlagged] = useState({});
      const recRef = useRef(null);

      const sectionKey = meta.num === 1 ? "request" : meta.num === 2 ? "safety" : "enhancements";

      const startVoice = () => {
        const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
        if(!SR){alert("Voice not available — use Type mode.");return;}
        const r=new SR(); r.continuous=true; r.interimResults=true; r.lang="en-US";
        let final=text;
        r.onresult=(e)=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript+" ";else interim+=e.results[i][0].transcript;}setText(final+interim);};
        r.onerror=r.onend=()=>setIsRec(false);
        r.start(); recRef.current=r; setIsRec(true);
      };
      const stopVoice=()=>{recRef.current?.stop();setIsRec(false);};

      const analyze=async()=>{
        if(!text.trim())return;
        setAna(true); setError(null);
        const systemPrompt = buildSystemPrompt(rules, sectionKey);
        const parsed = await callClaude(systemPrompt, text);
        if(parsed) { setExt(parsed); }
        else { setError("Something went wrong — please try again"); }
        setAna(false);
      };

      const getScopeKey=()=>extracted?Object.keys(extracted).find(k=>k.includes("scopes")):null;
      const getScopes=()=>extracted?(extracted[getScopeKey()]||[]):[];
      const removeScope=(i)=>{const key=getScopeKey();setExt({...extracted,[key]:extracted[key].filter((_,idx)=>idx!==i)});};
      const toggleFlag=(i)=>setFlagged(prev=>({...prev,[i]:!prev[i]}));

      const flaggedItems = Object.entries(flagged).filter(([,v])=>v).map(([i])=>getScopes()[parseInt(i)]).filter(Boolean);

      return h("div",{style:{display:"flex",flexDirection:"column",gap:14}},
        h("div",{style:{background:`linear-gradient(135deg,${meta.soft},${meta.soft}88)`,border:`1.5px solid ${meta.color}33`,borderRadius:20,overflow:"hidden",boxShadow:`0 0 32px ${meta.color}22`}},
          h("div",{style:{height:4,background:`linear-gradient(90deg,${meta.color},${meta.color}44)`}}),
          h("div",{style:{padding:"20px 20px 22px"}},
            h("div",{style:{display:"flex",alignItems:"flex-start",gap:12,marginBottom:14}},
              h("div",{style:{width:54,height:54,borderRadius:14,background:`${meta.color}22`,border:`2px solid ${meta.color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,flexShrink:0,boxShadow:`0 0 20px ${meta.color}44`}},meta.emoji),
              h("div",null,
                h("div",{style:{fontSize:10,fontWeight:800,color:meta.color,textTransform:"uppercase",letterSpacing:2,marginBottom:4}},`Step ${meta.num} of 3 — ${meta.label}`),
                h("div",{style:{fontSize:18,fontWeight:800,color:C.white,lineHeight:1.25}},meta.question),
                h("div",{style:{fontSize:12,color:C.mid,marginTop:5,fontStyle:"italic"}},meta.sub)
              )
            ),
            h("div",{style:{display:"flex",background:"rgba(0,0,0,0.3)",borderRadius:12,padding:4,marginBottom:14,border:`1px solid ${C.border}`}},
              [["type","⌨️  Type"],["voice","🎤  Voice"]].map(([m,label])=>
                h("button",{key:m,onClick:()=>setMode(m),style:{flex:1,padding:"10px 0",border:"none",borderRadius:9,background:mode===m?meta.color:"transparent",color:mode===m?C.bg:C.mid,fontWeight:800,fontSize:13,letterSpacing:0.5,transition:"all 0.2s",boxShadow:mode===m?`0 2px 12px ${meta.color}66`:"none"}},label)
              )
            ),
            mode==="voice"
              ? h("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:14}},
                  h("button",{onClick:isRec?stopVoice:startVoice,style:{width:96,height:96,borderRadius:"50%",border:`3px solid ${isRec?"#FF4757":meta.color}`,background:isRec?"rgba(255,71,87,0.15)":`${meta.color}22`,fontSize:36,display:"flex",alignItems:"center",justifyContent:"center",animation:isRec?"recPulse 1.5s ease-in-out infinite":"none",boxShadow:isRec?"none":`0 0 24px ${meta.color}55`,transition:"all 0.25s"}},isRec?"⏹":"🎤"),
                  h("div",{style:{fontSize:13,fontWeight:700,color:isRec?"#FF4757":C.mid,textTransform:"uppercase",letterSpacing:1,animation:isRec?"blink 1s infinite":"none"}},isRec?"● Listening — tap to stop":"Tap to speak"),
                  text&&h("div",{style:{width:"100%",background:"rgba(0,0,0,0.3)",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:13,color:C.mid,lineHeight:1.6,maxHeight:90,overflowY:"auto"}},text)
                )
              : h("textarea",{value:text,onChange:e=>setText(e.target.value),placeholder:meta.placeholder,
                  style:{width:"100%",minHeight:100,background:"rgba(0,0,0,0.3)",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:C.bright,resize:"vertical",outline:"none",lineHeight:1.6,caretColor:meta.color,transition:"border-color 0.2s"},
                  onFocus:e=>e.target.style.borderColor=meta.color,
                  onBlur:e=>e.target.style.borderColor=C.border
                }),
            error&&h("div",{style:{marginTop:10,padding:"10px 14px",background:C.redSoft,border:`1px solid ${C.red}44`,borderRadius:10,fontSize:13,color:C.red,fontWeight:600}},error),
            text&&!extracted&&h("button",{onClick:analyze,disabled:analyzing,style:{marginTop:14,width:"100%",background:analyzing?"rgba(0,0,0,0.2)":meta.color,color:analyzing?C.mid:C.bg,border:"none",borderRadius:12,padding:"15px",fontSize:15,fontWeight:900,letterSpacing:1,textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:analyzing?"none":`0 4px 20px ${meta.color}66`,transition:"all 0.2s"}},
              analyzing?[h("span",{key:"s",style:{animation:"spin 0.8s linear infinite",display:"inline-block"}},"◌")," Analyzing field conditions..."]:"◈ Analyze & Extract Scopes"
            )
          )
        ),

        extracted&&h("div",{style:{animation:"fadeUp 0.3s ease"}},
          h("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}},
            h("div",{style:{fontSize:11,fontWeight:800,color:meta.color,textTransform:"uppercase",letterSpacing:2}},"Scopes Found"),
            h("div",{style:{background:`${meta.color}22`,border:`1px solid ${meta.color}44`,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:800,color:meta.color}},getScopes().length)
          ),

          // Flag hint
          h("div",{style:{fontSize:12,color:C.dim,marginBottom:10,fontStyle:"italic"}},"🚩 Flag anything the AI got wrong — it helps train Field Intelligence"),

          getScopes().length
            ?getScopes().map((s,i)=>h(ScopeCard,{key:i,text:s,index:i,onRemove:()=>removeScope(i),onFlag:()=>toggleFlag(i),flagged:!!flagged[i]}))
            :h("div",{style:{color:C.mid,fontSize:13,fontStyle:"italic",padding:"12px 0"}},"Nothing extracted — try re-entering your notes"),

          // Job facts
          extracted.job_facts&&Object.entries(extracted.job_facts).some(([,v])=>v&&!(Array.isArray(v)&&!v.length)&&v!=="unknown"&&v!=="not mentioned"&&v!==false)&&
            h("div",{style:{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginTop:10}},
              h("div",{style:{fontSize:10,fontWeight:800,color:C.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:10}},"Field Intelligence Detected"),
              h("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
                Object.entries(extracted.job_facts).map(([k,v])=>{
                  if(!v||(Array.isArray(v)&&!v.length)||v==="unknown"||v==="not mentioned"||v===false)return null;
                  const isWarning = k.includes("triggers")||k.includes("requires")||k==="urgency";
                  return h("div",{key:k,style:{background:isWarning?`${C.amber}18`:C.bgInner,border:`1px solid ${isWarning?C.amber+"44":C.border}`,borderRadius:8,padding:"5px 11px",fontSize:12,color:C.mid}},
                    h("span",{style:{color:isWarning?C.amber:C.dim}},k.replace(/_/g," ")+": "),
                    h("span",{style:{color:C.bright,fontWeight:600}},Array.isArray(v)?v.join(", "):v.toString())
                  );
                })
              )
            ),

          // Flagged items — teach the AI
          flaggedItems.length>0&&h("div",{style:{background:C.redSoft,border:`1px solid ${C.red}33`,borderRadius:14,padding:"14px 16px",marginTop:10}},
            h("div",{style:{fontSize:11,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}},"🚩 Flagged as incorrect — these will help train Field Intelligence"),
            flaggedItems.map((item,i)=>h("div",{key:i,style:{fontSize:13,color:C.mid,padding:"4px 0",borderBottom:`1px solid ${C.red}22`}},item))
          ),

          h("button",{onClick:()=>onDone({text,extracted,flagged:flaggedItems}),style:{marginTop:14,width:"100%",background:meta.color,color:C.bg,border:"none",borderRadius:14,padding:"16px",fontSize:16,fontWeight:900,letterSpacing:1,textTransform:"uppercase",boxShadow:`0 6px 24px ${meta.color}55`,transition:"all 0.2s"}},"Looks Good — Next →")
        )
      );
    }

    // ── Review Step ───────────────────────────────────────────────
    function ReviewStep({data, onConfirm}) {
      const sections=[
        {label:"Customer Request",emoji:"🏠",color:C.cyan, scopes:data.request?.extracted?.requested_scopes||[]},
        {label:"Field Findings",  emoji:"⚡",color:C.amber,scopes:data.safety?.extracted?.safety_scopes||[]},
        {label:"Upgrade Ideas",   emoji:"💡",color:C.green,scopes:data.enhancements?.extracted?.enhancement_scopes||[]},
      ];
      const total=sections.reduce((n,s)=>n+s.scopes.length,0);
      const allFlags=[...(data.request?.flagged||[]),...(data.safety?.flagged||[]),...(data.enhancements?.flagged||[])];

      return h("div",{style:{display:"flex",flexDirection:"column",gap:14}},
        h("div",{style:{textAlign:"center",paddingBottom:4}},
          h("div",{style:{fontSize:40,marginBottom:8}},"📋"),
          h("div",{style:{fontSize:22,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}},"Ready to Build?"),
          h("div",{style:{fontSize:14,color:C.mid,marginTop:4}},`${total} scopes across ${sections.filter(s=>s.scopes.length).length} categories`)
        ),
        sections.map((s,si)=>
          h("div",{key:si,style:{background:C.bgCard,border:`1px solid ${s.color}25`,borderRadius:18,overflow:"hidden"}},
            h("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"14px 16px",background:`linear-gradient(90deg,${s.color}18,transparent)`,borderBottom:`1px solid ${s.color}15`}},
              h("span",{style:{fontSize:18}},s.emoji),
              h("span",{style:{fontSize:13,fontWeight:800,color:s.color,textTransform:"uppercase",letterSpacing:1}},s.label),
              h("div",{style:{marginLeft:"auto",background:s.color,color:C.bg,borderRadius:20,padding:"2px 11px",fontSize:12,fontWeight:900}},s.scopes.length)
            ),
            h("div",{style:{padding:"12px 14px 14px"}},
              s.scopes.length
                ?s.scopes.map((sc,i)=>h(ScopeCard,{key:i,text:sc,index:si*10+i}))
                :h("div",{style:{color:C.dim,fontSize:13,fontStyle:"italic"}},"Nothing captured")
            )
          )
        ),
        allFlags.length>0&&h("div",{style:{background:C.redSoft,border:`1px solid ${C.red}33`,borderRadius:14,padding:"14px 16px"}},
          h("div",{style:{fontSize:11,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}},"🚩 {allFlags.length} items flagged for Field Intelligence review"),
          allFlags.map((f,i)=>h("div",{key:i,style:{fontSize:12,color:C.mid,padding:"3px 0"}},`• ${f}`))
        ),
        h("button",{onClick:()=>onConfirm({requested:data.request?.extracted?.requested_scopes||[],safety:data.safety?.extracted?.safety_scopes||[],enhancements:data.enhancements?.extracted?.enhancement_scopes||[]}),style:{width:"100%",background:C.cyan,color:C.bg,border:"none",borderRadius:16,padding:"17px",fontSize:16,fontWeight:900,letterSpacing:1,textTransform:"uppercase",boxShadow:`0 6px 28px ${C.cyan}55`}},"◈ Build My Estimate Options")
      );
    }

    // ── Options Step ──────────────────────────────────────────────
    function OptionsStep({scopes, rules}) {
      const [options,setOptions]   = useState(null);
      const [loading,setLoading]   = useState(true);
      const [selected,setSelected] = useState(null);
      const [expanded,setExpanded] = useState(null);
      const [error,setError]       = useState(null);

      useEffect(()=>{
        (async()=>{
          const parsed = await callClaude(null, buildOptionsPrompt(scopes, rules));
          if(parsed&&parsed.options) setOptions(parsed.options);
          else setError("Could not build options — please try again");
          setLoading(false);
        })();
      },[]);

      if(loading) return h("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"64px 0"}},
        h("div",{style:{width:60,height:60,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.cyan}`,borderRadius:"50%",animation:"spin 0.9s linear infinite",boxShadow:`0 0 24px ${C.cyan}44`}}),
        h("div",{style:{fontSize:17,fontWeight:800,color:C.white}},"Building options..."),
        h("div",{style:{fontSize:13,color:C.mid}},"Applying Field Intelligence rules...")
      );

      if(error) return h("div",{style:{padding:"32px 0",textAlign:"center",color:C.red,fontSize:15,fontWeight:600}},error);

      return h("div",{style:{display:"flex",flexDirection:"column",gap:10}},
        h("div",{style:{paddingBottom:6}},
          h("div",{style:{fontSize:22,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}},`${options?.length} Options Ready`),
          h("div",{style:{fontSize:13,color:C.mid,marginTop:2}},"Tap to select · Tap again to see details")
        ),
        options?.map((opt,oi)=>{
          const color=OPTION_COLORS[oi%OPTION_COLORS.length];
          const isSel=selected===opt.number, isExp=expanded===opt.number;
          return h("div",{key:opt.number,style:{borderRadius:18,overflow:"hidden",border:`2px solid ${isSel?color:"transparent"}`,boxShadow:isSel?`0 6px 28px ${color}44`:"0 2px 12px rgba(0,0,0,0.3)",transition:"all 0.25s ease",animation:"fadeUp 0.3s ease both",animationDelay:`${oi*0.06}s`}},
            h("div",{onClick:()=>{setSelected(isSel?null:opt.number);setExpanded(isExp?null:opt.number);},style:{display:"flex",alignItems:"center",background:color,cursor:"pointer",minHeight:62}},
              h("div",{style:{width:62,height:62,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.2)",fontSize:22,fontWeight:900,color:C.white,fontFamily:"'Barlow Condensed',sans-serif"}},opt.number),
              h("div",{style:{flex:1,padding:"0 14px"}},
                h("div",{style:{fontSize:16,fontWeight:800,color:C.white,lineHeight:1.2}},opt.name),
                h("div",{style:{display:"flex",alignItems:"center",gap:8,marginTop:3}},
                  h("div",{style:{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:1.2}},TIER_LABEL[opt.tier]||opt.tier),
                  opt.permits_required&&h("div",{style:{fontSize:9,fontWeight:700,color:C.amber,background:"rgba(0,0,0,0.3)",borderRadius:4,padding:"2px 6px",textTransform:"uppercase",letterSpacing:0.8}},"Permits Required")
                )
              ),
              h("div",{style:{width:62,height:62,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:isSel?"rgba(255,255,255,0.25)":"rgba(0,0,0,0.15)"}},
                h("div",{style:{width:30,height:30,borderRadius:"50%",background:isSel?C.white:"rgba(255,255,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:isSel?color:"rgba(255,255,255,0.6)",fontWeight:900,transition:"all 0.2s"}},isSel?"✓":"")
              )
            ),
            isExp&&h("div",{style:{background:C.bgCard,borderTop:`1px solid ${color}33`,padding:"14px 16px",animation:"fadeUp 0.2s ease"}},
              h("div",{style:{fontSize:13,color:C.mid,fontStyle:"italic",marginBottom:12,lineHeight:1.55}},`"${opt.value_statement}"`),
              h("div",{style:{fontSize:10,fontWeight:800,color:C.dim,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}},"What's Included"),
              opt.includes?.map((item,i)=>
                h("div",{key:i,style:{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",marginBottom:6,background:`${color}14`,border:`1px solid ${color}30`,borderRadius:10}},
                  h("div",{style:{width:6,height:6,borderRadius:"50%",background:color,flexShrink:0}}),
                  h("span",{style:{fontSize:13,color:C.bright,fontWeight:600}},item)
                )
              )
            )
          );
        }),
        selected&&h("button",{style:{marginTop:8,width:"100%",background:C.amber,color:C.bg,border:"none",borderRadius:16,padding:"17px",fontSize:16,fontWeight:900,letterSpacing:1,textTransform:"uppercase",boxShadow:`0 6px 28px ${C.amber}55`,animation:"fadeUp 0.25s ease"}},"📋 Send to Housecall Pro →")
      );
    }

    // ── App Root ──────────────────────────────────────────────────
    function FieldGuide() {
      const [step,setStep]           = useState("request");
      const [data,setData]           = useState({});
      const [scopes,setScopes]       = useState(null);
      const [rules,setRules]         = useState(loadRules);
      const [showIntel,setShowIntel] = useState(false);

      const handleStep=(key,result)=>{
        setData(prev=>({...prev,[key]:result}));
        if(key==="request")           setStep("safety");
        else if(key==="safety")       setStep("enhancements");
        else if(key==="enhancements") setStep("review");
      };

      const handleSaveRules=(updated)=>{ setRules(updated); saveRules(updated); };
      const reset=()=>{ setStep("request"); setData({}); setScopes(null); };

      if(showIntel) return h(IntelligenceScreen,{rules,onBack:()=>setShowIntel(false),onSave:handleSaveRules});

      return h("div",{style:{minHeight:"100vh",background:C.bg}},
        h(StepHeader,{current:step,onReset:reset,onIntelligence:()=>setShowIntel(true)}),
        h("div",{style:{maxWidth:480,margin:"0 auto",padding:"20px 16px 56px"}},
          step==="request"      && h(InputStep,{meta:STEP_META.request,      onDone:r=>handleStep("request",r),      saved:data.request,      rules}),
          step==="safety"       && h(InputStep,{meta:STEP_META.safety,       onDone:r=>handleStep("safety",r),       saved:data.safety,       rules}),
          step==="enhancements" && h(InputStep,{meta:STEP_META.enhancements, onDone:r=>handleStep("enhancements",r), saved:data.enhancements, rules}),
          step==="review"       && h(ReviewStep,{data,onConfirm:s=>{setScopes(s);setStep("options");}}),
          step==="options"      && scopes && h(OptionsStep,{scopes,rules})
        )
      );
    }

    createRoot(document.getElementById("root")).render(h(FieldGuide,null));
  </script>
</body>
</html>
