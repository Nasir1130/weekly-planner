'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { loadPlannerData, savePlannerData } from '../lib/supabase';

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITIES = ["Very High", "High", "Med", "Low"];
const DEFAULT_FLAT_CATEGORIES = ["School", "Friends", "Buy"];
const DEFAULT_NOTE_CATEGORIES = ["Daily Thoughts", "Projects", "Dreams"];
const RECURRENCE_OPTIONS = ["none", "weekly", "biweekly"];
const EVENT_CATEGORIES = ["Client", "Class", "Personal"];
const EVENT_CAT_COLORS = {
  Client: { text: "#185FA5", light: "#E6F1FB" },
  Class: { text: "#0F6E56", light: "#E1F5EE" },
  Personal: { text: "#1a1a1a", light: "#f2f1ee" },
};

const FLAT_CAT_PALETTE = [
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#E1F5EE", text: "#0F6E56" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#E6F1FB", text: "#185FA5" },
  { bg: "#FCE8F1", text: "#A3295B" },
  { bg: "#FEF3E2", text: "#9A5B13" },
  { bg: "#E8F4E5", text: "#2D7A2D" },
  { bg: "#F0ECFE", text: "#6B47B8" },
  { bg: "#E5F6F6", text: "#1A7A7A" },
  { bg: "#FDE8E8", text: "#B42525" },
];

// Separate palette for notes so colors don't clash with todo categories
const NOTE_CAT_PALETTE = [
  { bg: "#E5F6F6", text: "#1A7A7A" },  // teal
  { bg: "#FEF3E2", text: "#9A5B13" },  // warm
  { bg: "#F0ECFE", text: "#6B47B8" },  // violet
  { bg: "#E8F4E5", text: "#2D7A2D" },  // forest
  { bg: "#FCE8F1", text: "#A3295B" },  // rose
  { bg: "#E6F1FB", text: "#185FA5" },  // blue
  { bg: "#FAEEDA", text: "#854F0B" },  // amber
  { bg: "#EEEDFE", text: "#534AB7" },  // purple
  { bg: "#FDE8E8", text: "#B42525" },  // red
  { bg: "#E1F5EE", text: "#0F6E56" },  // green
];

function getCatColor(cat, categoryList) {
  const idx = categoryList.indexOf(cat);
  if (idx === -1) return FLAT_CAT_PALETTE[0];
  return FLAT_CAT_PALETTE[idx % FLAT_CAT_PALETTE.length];
}

function getNoteCatColor(cat, categoryList) {
  const idx = categoryList.indexOf(cat);
  if (idx === -1) return NOTE_CAT_PALETTE[0];
  return NOTE_CAT_PALETTE[idx % NOTE_CAT_PALETTE.length];
}

function getMondayOfCurrentWeek() {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getWeekDates(offset = 0) {
  const monday = getMondayOfCurrentWeek();
  monday.setDate(monday.getDate() + offset * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function getMondayStr(offset = 0) {
  const dates = getWeekDates(offset);
  const d = dates[0];
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isBiweeklyVisible(anchorDate, weekOffset) {
  if (!anchorDate) return true;
  const anchor = new Date(anchorDate);
  anchor.setHours(0, 0, 0, 0);
  const currentMonday = getMondayOfCurrentWeek();
  currentMonday.setDate(currentMonday.getDate() + weekOffset * 7);
  const diffDays = Math.round((currentMonday - anchor) / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.round(diffDays / 7);
  return diffWeeks % 2 === 0;
}

function formatDate(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function isToday(d) {
  const t = new Date();
  return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatCompletedDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatNoteTimestamp(ts) {
  const d = new Date(ts);
  const day = DAYS[(d.getDay() + 6) % 7]; // Convert Sun=0 to Mon=0 based
  const month = d.getMonth() + 1;
  const date = d.getDate();
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${day} ${month}/${date} ${hours}:${mins}${ampm}`;
}

function parseTimeToMinutes(t) {
  if (!t) return 9999;
  const lower = t.toLowerCase().trim();
  if (lower === "pm" || lower === "am" || lower === "evening" || lower === "morning") return lower.startsWith("a") ? 600 : 1200;
  const match = lower.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
  if (!match) return 9999;
  let hours = parseInt(match[1], 10);
  const mins = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3];
  if (ampm === "pm" && hours < 12) hours += 12;
  if (ampm === "am" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

function sortByTime(items) {
  return [...items].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
}

const defaultData = () => ({
  schedule: DAYS.reduce((acc, day) => ({ ...acc, [day]: [] }), {}),
  todos: {
    priority: PRIORITIES.reduce((acc, p) => ({ ...acc, [p]: [] }), {}),
    flat: DEFAULT_FLAT_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: [] }), {}),
  },
  completed: [],
  collapsed: {},
  showCompleted: false,
  showAllCompleted: false,
  weekOffset: 0,
  manualWeeklyTasks: [],
  weeklyTaskChecks: {},
  flatCategories: DEFAULT_FLAT_CATEGORIES,
  activeTab: "todo",
  notes: {},           // { "2026-03-30": { "Daily Thoughts": [ { id, text, createdAt, updatedAt } ] } }
  noteCategories: DEFAULT_NOTE_CATEGORIES,
  noteCollapsed: {},
});

async function loadData() {
  try {
    const data = await loadPlannerData();
    if (data) {
      const def = defaultData();
      return {
        ...def,
        ...data,
        todos: {
          priority: { ...def.todos.priority, ...(data.todos?.priority || {}) },
          flat: { ...def.todos.flat, ...(data.todos?.flat || {}) },
        },
        // Migration: derive flatCategories from existing flat keys if not present
        flatCategories: data.flatCategories || Object.keys(data.todos?.flat || def.todos.flat),
        noteCategories: data.noteCategories || DEFAULT_NOTE_CATEGORIES,
        notes: data.notes || {},
        noteCollapsed: data.noteCollapsed || {},
        activeTab: data.activeTab || "todo",
      };
    }
    return null;
  } catch (e) {
    console.error("Load failed:", e);
    return null;
  }
}

async function saveData(data) {
  try {
    await savePlannerData(data);
  } catch (e) {
    console.error("Save failed:", e);
  }
}

const sampleData = defaultData;

// ─── SHARED COMPONENTS ───────────────────────────────────────────

function Modal({ children, onClose }) {
  const backdropRef = useRef(null);
  const handleMouseDown = (e) => {
    // Only close if the click started directly on the backdrop
    if (e.target === backdropRef.current) onClose();
  };
  return (
    <div ref={backdropRef} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      padding: "1rem",
    }} onMouseDown={handleMouseDown}>
      <div onMouseDown={e => e.stopPropagation()} style={{
        background: "#f5f5f4",
        border: "1px solid #b4b2a9",
        borderRadius: "12px",
        padding: "1.5rem", width: "100%", maxWidth: 640,
        boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
        position: "relative", zIndex: 1001,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        {children}
      </div>
    </div>
  );
}

function CollapseArrow({ collapsed }) {
  return (
    <span style={{
      display: "inline-block", fontSize: 11, color: "#999996",
      transition: "transform 0.15s ease", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
      marginRight: 6, userSelect: "none",
    }}>&#9660;</span>
  );
}

function Linkify({ children, style }) {
  if (typeof children !== "string") return <span style={style}>{children}</span>;
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  const parts = children.split(urlRegex);
  if (parts.length === 1) return <span style={style}>{children}</span>;
  return (
    <span style={style}>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: "#185FA5", textDecoration: "underline", wordBreak: "break-all" }}
          >{part.length > 40 ? part.slice(0, 37) + "..." : part}</a>
        ) : <span key={i}>{part}</span>
      )}
    </span>
  );
}

function RecurrenceTag({ recurrence }) {
  if (recurrence === "none") return null;
  return (
    <span style={{ fontSize: 11, fontWeight: 400, color: "#999996", marginLeft: 3 }}>
      {recurrence === "weekly" ? "(R)" : "(R2)"}
    </span>
  );
}

// ─── REUSABLE CATEGORY MANAGER (used for both todo + notes) ──────

function ManageCategoriesModal({ title, description, categories, palette, onSave, onClose, reservedNames }) {
  const [cats, setCats] = useState(categories.map(c => ({ name: c, originalName: c })));
  const [newCat, setNewCat] = useState("");
  const [error, setError] = useState("");
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const newRef = useRef(null);

  const addCat = () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    if (cats.some(c => c.name.toLowerCase() === trimmed.toLowerCase()) || (reservedNames || []).some(r => r.toLowerCase() === trimmed.toLowerCase())) {
      setError("That name is already in use");
      return;
    }
    setCats([...cats, { name: trimmed, originalName: null }]);
    setNewCat("");
    setError("");
  };

  const renameCat = (idx, newName) => {
    const updated = [...cats];
    updated[idx] = { ...updated[idx], name: newName };
    setCats(updated);
    setError("");
  };

  const removeCat = (idx) => {
    setCats(cats.filter((_, i) => i !== idx));
    setError("");
  };

  const moveCat = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= cats.length) return;
    const updated = [...cats];
    const [item] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, item);
    setCats(updated);
  };

  const handleCatDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
    e.currentTarget.style.opacity = "0.4";
  };
  const handleCatDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleCatDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  };
  const handleCatDrop = (e, toIdx) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== toIdx) moveCat(dragIdx, toIdx);
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleSave = () => {
    const names = cats.map(c => c.name.trim()).filter(Boolean);
    const lowerNames = names.map(n => n.toLowerCase());
    const dupes = lowerNames.filter((n, i) => lowerNames.indexOf(n) !== i);
    if (dupes.length > 0) { setError("Duplicate category names aren't allowed"); return; }
    if ((reservedNames || []).some(r => names.some(n => n.toLowerCase() === r.toLowerCase()))) {
      setError("That name conflicts with a reserved name"); return;
    }
    const renames = {};
    const deletions = [];
    categories.forEach(orig => {
      const match = cats.find(c => c.originalName === orig);
      if (!match) deletions.push(orig);
      else if (match.name.trim() !== orig) renames[orig] = match.name.trim();
    });
    const additions = cats.filter(c => c.originalName === null).map(c => c.name.trim());
    onSave({ finalOrder: names, renames, deletions, additions });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
      <div style={{ fontSize: 12, color: "#666663" }}>{description}</div>
      {cats.map((cat, idx) => {
        const cc = palette[idx % palette.length];
        const isOver = dragOverIdx === idx && dragIdx !== idx;
        return (
          <div key={cat.originalName || `new-${idx}`}>
            {isOver && dragIdx !== null && dragIdx > idx && (
              <div style={{ height: 2, background: "#85B7EB", borderRadius: 1, margin: "2px 0" }} />
            )}
            <div draggable onDragStart={e => handleCatDragStart(e, idx)} onDragEnd={handleCatDragEnd}
              onDragOver={e => handleCatDragOver(e, idx)} onDrop={e => handleCatDrop(e, idx)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
                background: dragIdx === idx ? "#f2f1ee" : "transparent", borderRadius: 6, transition: "background 0.1s" }}>
              <span style={{ fontSize: 12, color: "#999996", cursor: "grab", padding: "2px 2px", userSelect: "none", flexShrink: 0 }} title="Drag to reorder">&#8942;</span>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: cc.text, flexShrink: 0 }} />
              <input value={cat.name} onChange={e => renameCat(idx, e.target.value)} style={{ flex: 1, fontSize: 14, padding: "6px 10px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 0, flexShrink: 0 }}>
                <button onClick={() => moveCat(idx, idx - 1)} disabled={idx === 0} style={{
                  fontSize: 9, lineHeight: 1, padding: "1px 4px", border: "none", background: "transparent",
                  color: idx === 0 ? "#d4d3d0" : "#999996", cursor: idx === 0 ? "default" : "pointer" }} title="Move up">&#9650;</button>
                <button onClick={() => moveCat(idx, idx + 1)} disabled={idx === cats.length - 1} style={{
                  fontSize: 9, lineHeight: 1, padding: "1px 4px", border: "none", background: "transparent",
                  color: idx === cats.length - 1 ? "#d4d3d0" : "#999996", cursor: idx === cats.length - 1 ? "default" : "pointer" }} title="Move down">&#9660;</button>
              </div>
              <button onClick={() => removeCat(idx)} style={{ fontSize: 16, lineHeight: 1, padding: "4px 8px", border: "none", background: "transparent", color: "#999996", cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#A32D2D"; e.currentTarget.style.background = "#FCEBEB"; e.currentTarget.style.borderRadius = "4px"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#999996"; e.currentTarget.style.background = "transparent"; }}
                title="Remove category">&times;</button>
            </div>
            {isOver && dragIdx !== null && dragIdx < idx && (
              <div style={{ height: 2, background: "#85B7EB", borderRadius: 1, margin: "2px 0" }} />
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#d4d3d0", flexShrink: 0 }} />
        <input ref={newRef} placeholder="New category name..." value={newCat}
          onChange={e => { setNewCat(e.target.value); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter") addCat(); }}
          style={{ flex: 1, fontSize: 14, padding: "6px 10px" }} />
        <button onClick={addCat} style={{ fontSize: 12, padding: "4px 10px", background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Add</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "#A32D2D" }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        <button onClick={onClose}>Cancel</button>
        <button onClick={handleSave} style={{ background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Save changes</button>
      </div>
    </div>
  );
}

// ─── FORM COMPONENTS ─────────────────────────────────────────────

function ScheduleItemForm({ item, dayKey, onSave, onSaveOverride, onRevertOverride, onCancel, onDelete, onSkip, isSkipped, isRecurring, hasOverride }) {
  const [editScope, setEditScope] = useState(hasOverride ? "week" : "week");
  const [time, setTime] = useState(item?.time || "");
  const [endTime, setEndTime] = useState(item?.endTime || "");
  const [text, setText] = useState(item?.text || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [day, setDay] = useState(dayKey || "Mon");
  const [recurrence, setRecurrence] = useState(item?.recurrence || "none");
  const [category, setCategory] = useState(item?.category || "Personal");
  const [excludeFromTasks, setExcludeFromTasks] = useState(item?.excludeFromTasks || false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const showsAsSession = text.toLowerCase().includes("session") && category === "Client";
  const isWeekScope = isRecurring && editScope === "week";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{item ? "Edit event" : "New event"}</div>
      {item && isRecurring && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#666663" }}>Editing:</span>
          {["week", "all"].map(scope => (
            <button key={scope} onClick={() => setEditScope(scope)} style={{
              fontSize: 12, padding: "4px 10px",
              background: editScope === scope ? "#E6F1FB" : "transparent",
              color: editScope === scope ? "#185FA5" : "#666663",
              borderColor: editScope === scope ? "#85B7EB" : undefined,
            }}>{scope === "week" ? "This week" : "All weeks"}</button>
          ))}
          {hasOverride && (
            <button onClick={onRevertOverride} style={{
              fontSize: 11, padding: "3px 8px", marginLeft: "auto",
              background: "transparent", color: "#999996", borderColor: "#d4d3d0",
            }}
              onMouseEnter={e => { e.currentTarget.style.color = "#854F0B"; e.currentTarget.style.background = "#FAEEDA"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#999996"; e.currentTarget.style.background = "transparent"; }}
            >Revert</button>
          )}
        </div>
      )}
      {isWeekScope && (
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#666663", marginRight: 2 }}>Day:</span>
          {DAYS.map(d => (
            <button key={d} onClick={() => setDay(d)} style={{
              fontSize: 11, padding: "3px 8px",
              background: day === d ? "#E6F1FB" : "transparent",
              color: day === d ? "#185FA5" : "#666663",
              borderColor: day === d ? "#85B7EB" : undefined,
            }}>{d}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input ref={inputRef} placeholder="Start (e.g. 9:00am)" value={time} onChange={e => setTime(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="End (optional)" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input placeholder="Description" value={text} onChange={e => setText(e.target.value)} />
      <input placeholder="Notes (Zoom link, address, etc.)" value={notes} onChange={e => setNotes(e.target.value)}
        style={{ fontSize: 13, color: "#666663" }} />
      {notes && /(https?:\/\/[^\s<]+)/.test(notes) && (
        <div style={{ fontSize: 12, padding: "4px 0" }}>
          {notes.match(/(https?:\/\/[^\s<]+)/g).map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer"
              style={{ color: "#185FA5", textDecoration: "underline", display: "block", marginBottom: 2, wordBreak: "break-all" }}
            >{url.length > 60 ? url.slice(0, 57) + "..." : url}</a>
          ))}
        </div>
      )}
      {!isWeekScope && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#666663" }}>Type:</span>
          {EVENT_CATEGORIES.map(c => {
            const cc = EVENT_CAT_COLORS[c];
            return (
              <button key={c} onClick={() => setCategory(c)} style={{
                fontSize: 12, padding: "4px 10px",
                background: category === c ? cc.light : "transparent",
                color: category === c ? cc.text : "#666663",
                borderColor: category === c ? cc.text : undefined,
              }}>{c}</button>
            );
          })}
        </div>
      )}
      {!isWeekScope && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#666663" }}>Repeats:</span>
          {RECURRENCE_OPTIONS.map(r => (
            <button key={r} onClick={() => setRecurrence(r)} style={{
              fontSize: 12, padding: "4px 10px",
              background: recurrence === r ? "#E6F1FB" : "transparent",
              color: recurrence === r ? "#185FA5" : "#666663",
              borderColor: recurrence === r ? "#85B7EB" : undefined,
            }}>{r === "none" ? "One-time" : r === "weekly" ? "Weekly" : "Biweekly"}</button>
          ))}
        </div>
      )}
      {showsAsSession && !isWeekScope && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666663", cursor: "pointer" }}>
          <input type="checkbox" checked={excludeFromTasks} onChange={e => setExcludeFromTasks(e.target.checked)} />
          No progress note needed
        </label>
      )}
      {isWeekScope && (
        <div style={{ fontSize: 11, color: "#999996", fontStyle: "italic" }}>
          Changes apply to this week only. Category and recurrence can only be changed when editing all weeks.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        {item && onDelete && !isWeekScope && <button onClick={onDelete} style={{ color: "#A32D2D", borderColor: "#F09595", marginRight: "auto" }}>Delete</button>}
        {item && isRecurring && onSkip && (
          <button onClick={onSkip} style={{
            fontSize: 12, padding: "4px 10px", marginRight: item && onDelete && !isWeekScope ? 0 : "auto",
            background: isSkipped ? "#EAF3DE" : "#FAEEDA",
            color: isSkipped ? "#3B6D11" : "#854F0B",
            borderColor: isSkipped ? "#C0DD97" : "#FAC775",
          }}>{isSkipped ? "Unskip this week" : "Skip this week"}</button>
        )}
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => {
          if (!text.trim()) return;
          if (isWeekScope) {
            onSaveOverride({ time, endTime, text, notes, day });
          } else {
            onSave({ time, endTime, text, notes, recurrence, category, excludeFromTasks });
          }
        }} style={{ background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Save</button>
      </div>
    </div>
  );
}

function TodoItemForm({ item, onSave, onCancel, onDelete, categories }) {
  const [text, setText] = useState(item?.text || "");
  const [bold, setBold] = useState(item?.bold || false);
  const [category, setCategory] = useState(item?._moveTarget || "");
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{item ? "Edit item" : "New item"}</div>
      <input ref={inputRef} placeholder="What needs doing?" value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && text.trim()) onSave({ text, bold, moveTarget: category }); }} />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666663", cursor: "pointer" }}>
          <input type="checkbox" checked={bold} onChange={e => setBold(e.target.checked)} /> Bold
        </label>
        {item && categories && (
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ fontSize: 13, padding: "4px 8px" }}>
            <option value="">Move to...</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        {item && onDelete && <button onClick={onDelete} style={{ color: "#A32D2D", borderColor: "#F09595", marginRight: "auto" }}>Delete</button>}
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => { if (text.trim()) onSave({ text, bold, moveTarget: category }); }} style={{ background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Save</button>
      </div>
    </div>
  );
}

function NoteEntryForm({ entry, onSave, onCancel, onDelete, todoCategories, onAddTodo }) {
  const [text, setText] = useState(entry?.text || "");
  const [todoPicker, setTodoPicker] = useState(null); // { text } when showing category picker
  const [todoConfirm, setTodoConfirm] = useState(null); // brief confirmation message
  const textRef = useRef(null);
  useEffect(() => {
    if (textRef.current) textRef.current.focus();
  }, []);
  const handleCreateTodo = () => {
    if (!textRef.current) return;
    const start = textRef.current.selectionStart;
    const end = textRef.current.selectionEnd;
    const selected = start !== end ? text.slice(start, end).trim() : "";
    const todoText = selected || text.trim();
    if (todoText) setTodoPicker({ text: todoText });
  };
  const handlePickCategory = (cat) => {
    if (todoPicker && onAddTodo) {
      onAddTodo(todoPicker.text, cat);
      setTodoPicker(null);
      setTodoConfirm(cat);
      setTimeout(() => setTodoConfirm(null), 2000);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{entry ? "Edit note" : "New note"}</div>
      <textarea ref={textRef} placeholder="Write your thoughts..." value={text}
        onChange={e => setText(e.target.value)}
        style={{ fontSize: 14, padding: "10px", minHeight: 180, resize: "vertical", lineHeight: 1.6,
          borderRadius: 8, border: "1px solid #d4d3d0", fontFamily: "inherit" }} />
      {todoPicker && (
        <div style={{ background: "#f8f8f6", borderRadius: 8, padding: "10px 12px" }}>
          <div style={{ fontSize: 12, color: "#666663", marginBottom: 6 }}>
            Add to-do: <span style={{ color: "#1a1a1a", fontWeight: 500 }}>"{todoPicker.text.length > 60 ? todoPicker.text.slice(0, 57) + "..." : todoPicker.text}"</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {todoCategories.map(cat => (
              <button key={cat.name} onClick={() => handlePickCategory(cat)} style={{
                fontSize: 11, padding: "4px 10px",
                background: cat.bg, color: cat.text, borderColor: cat.bg,
                borderRadius: 6, cursor: "pointer",
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                onMouseLeave={e => e.currentTarget.style.opacity = "1"}
              >{cat.label}</button>
            ))}
            <button onClick={() => setTodoPicker(null)} style={{
              fontSize: 11, padding: "4px 8px", background: "transparent",
              color: "#999996", border: "none", cursor: "pointer",
            }}>✕</button>
          </div>
        </div>
      )}
      {todoConfirm && !todoPicker && (
        <div style={{ fontSize: 12, color: "#3B6D11", padding: "4px 0" }}>
          ✓ Added to {todoConfirm.label}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
        {entry && onDelete && <button onClick={onDelete} style={{ color: "#A32D2D", borderColor: "#F09595" }}>Delete</button>}
        {onAddTodo && !todoPicker && (
          <button onClick={handleCreateTodo} style={{
            fontSize: 12, padding: "4px 10px",
            background: "transparent", color: "#999996", borderColor: "#d4d3d0",
          }}
            onMouseEnter={e => { e.currentTarget.style.color = "#185FA5"; e.currentTarget.style.background = "#E6F1FB"; e.currentTarget.style.borderColor = "#85B7EB"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#999996"; e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#d4d3d0"; }}
          >→ To-do</button>
        )}
        <span style={{ flex: 1 }} />
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => { if (text.trim()) onSave(text.trim()); }} style={{ background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Save</button>
      </div>
    </div>
  );
}

// ─── MAIN PLANNER ────────────────────────────────────────────────

export default function Planner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileDayIndex, setMobileDayIndex] = useState(() => {
    const today = new Date().getDay();
    return today === 0 ? 6 : today - 1;
  });

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    loadData().then(loaded => {
      setData(loaded || sampleData());
      setLoading(false);
    });
  }, []);

  // Reset mobile day to today when returning to current week
  useEffect(() => {
    if (weekOffset === 0) {
      const today = new Date().getDay();
      setMobileDayIndex(today === 0 ? 6 : today - 1);
    } else {
      setMobileDayIndex(0);
    }
  }, [weekOffset]);

  const persist = useCallback((newData) => {
    setData(newData);
    saveData(newData);
  }, []);

  const weekDates = getWeekDates(weekOffset);
  const viewingMonday = getMondayStr(weekOffset);

  if (loading) return <div style={{ padding: "2rem", color: "#666663" }}>Loading...</div>;
  if (!data) return null;

  const flatCategories = data.flatCategories || Object.keys(data.todos.flat);
  const noteCategories = data.noteCategories || DEFAULT_NOTE_CATEGORIES;
  const activeTab = data.activeTab || "todo";

  const setActiveTab = (tab) => persist({ ...data, activeTab: tab });

  const toggleCollapse = (key) => {
    persist({ ...data, collapsed: { ...data.collapsed, [key]: !data.collapsed[key] } });
  };

  const toggleNoteCollapse = (key) => {
    persist({ ...data, noteCollapsed: { ...(data.noteCollapsed || {}), [key]: !(data.noteCollapsed || {})[key] } });
  };

  // ─── SCHEDULE CRUD ───
  const addScheduleItem = (dayKey, item) => {
    const newItem = { id: uid(), ...item, bold: false, category: item.category || "Personal" };
    if (item.recurrence === "none") newItem.eventDate = viewingMonday;
    else if (item.recurrence === "biweekly") newItem.anchorDate = viewingMonday;
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: sortByTime([...data.schedule[dayKey], newItem]) } });
    setModal(null);
  };

  const editScheduleItem = (dayKey, itemId, updates) => {
    const items = sortByTime(data.schedule[dayKey].map(it => {
      if (it.id !== itemId) return it;
      const updated = { ...it, ...updates };
      if (updates.recurrence === "none" && !updated.eventDate) updated.eventDate = viewingMonday;
      if (updates.recurrence === "biweekly" && !updated.anchorDate) updated.anchorDate = viewingMonday;
      if (updates.recurrence === "weekly") { delete updated.eventDate; delete updated.anchorDate; }
      return updated;
    }));
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  const saveScheduleOverride = (dayKey, itemId, overrideFields) => {
    const items = data.schedule[dayKey].map(it => {
      if (it.id !== itemId) return it;
      const weekOverrides = { ...(it.weekOverrides || {}) };
      weekOverrides[viewingMonday] = overrideFields;
      return { ...it, weekOverrides };
    });
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  const revertScheduleOverride = (dayKey, itemId) => {
    const items = data.schedule[dayKey].map(it => {
      if (it.id !== itemId) return it;
      const weekOverrides = { ...(it.weekOverrides || {}) };
      delete weekOverrides[viewingMonday];
      return { ...it, weekOverrides };
    });
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  const getEffectiveEvent = (item) => {
    const override = item.weekOverrides?.[viewingMonday];
    if (!override) return item;
    return { ...item, ...override };
  };

  const deleteScheduleItem = (dayKey, itemId) => {
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: data.schedule[dayKey].filter(it => it.id !== itemId) } });
    setModal(null);
  };

  const toggleSkipScheduleItem = (dayKey, itemId) => {
    const items = data.schedule[dayKey].map(it => {
      if (it.id !== itemId) return it;
      const skipDates = it.skipDates || [];
      const alreadySkipped = skipDates.includes(viewingMonday);
      return { ...it, skipDates: alreadySkipped ? skipDates.filter(d => d !== viewingMonday) : [...skipDates, viewingMonday] };
    });
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  // ─── TODO CRUD ───
  const addTodoItem = (section, subKey, item) => {
    const newItem = { id: uid(), text: item.text, bold: item.bold, checked: false };
    const newTodos = { ...data.todos };
    if (section === "priority") newTodos.priority = { ...newTodos.priority, [subKey]: [...newTodos.priority[subKey], newItem] };
    else newTodos.flat = { ...newTodos.flat, [subKey]: [...newTodos.flat[subKey], newItem] };
    persist({ ...data, todos: newTodos });
    setModal(null);
  };

  const editTodoItem = (section, subKey, itemId, updates) => {
    const newTodos = { ...data.todos };
    if (updates.moveTarget && updates.moveTarget !== subKey) {
      const sourceList = section === "priority" ? newTodos.priority : newTodos.flat;
      const item = sourceList[subKey].find(it => it.id === itemId);
      sourceList[subKey] = sourceList[subKey].filter(it => it.id !== itemId);
      const isPriorityTarget = PRIORITIES.includes(updates.moveTarget);
      const targetSection = isPriorityTarget ? newTodos.priority : newTodos.flat;
      targetSection[updates.moveTarget] = [...targetSection[updates.moveTarget], { ...item, text: updates.text, bold: updates.bold }];
    } else {
      const list = section === "priority" ? newTodos.priority : newTodos.flat;
      list[subKey] = list[subKey].map(it => it.id === itemId ? { ...it, text: updates.text, bold: updates.bold } : it);
    }
    persist({ ...data, todos: newTodos });
    setModal(null);
  };

  const deleteTodoItem = (section, subKey, itemId) => {
    const newTodos = { ...data.todos };
    if (section === "priority") newTodos.priority[subKey] = newTodos.priority[subKey].filter(it => it.id !== itemId);
    else newTodos.flat[subKey] = newTodos.flat[subKey].filter(it => it.id !== itemId);
    persist({ ...data, todos: newTodos });
    setModal(null);
  };

  const checkTodoItem = (section, subKey, itemId) => {
    const newTodos = { ...data.todos };
    let item;
    if (section === "priority") {
      item = newTodos.priority[subKey].find(it => it.id === itemId);
      newTodos.priority[subKey] = newTodos.priority[subKey].filter(it => it.id !== itemId);
    } else {
      item = newTodos.flat[subKey].find(it => it.id === itemId);
      newTodos.flat[subKey] = newTodos.flat[subKey].filter(it => it.id !== itemId);
    }
    const completedItem = { ...item, checked: true, completedAt: Date.now(), completedWeek: viewingMonday, fromSection: section, fromKey: subKey };
    persist({ ...data, todos: newTodos, completed: [...data.completed, completedItem] });
  };

  const uncheckCompleted = (itemId) => {
    const item = data.completed.find(it => it.id === itemId);
    if (!item) return;
    const newCompleted = data.completed.filter(it => it.id !== itemId);
    const restored = { id: item.id, text: item.text, bold: item.bold, checked: false };
    const newTodos = { ...data.todos };
    if (item.fromSection === "priority" && newTodos.priority[item.fromKey]) {
      newTodos.priority[item.fromKey] = [...newTodos.priority[item.fromKey], restored];
    } else if (item.fromSection === "flat" && newTodos.flat[item.fromKey]) {
      newTodos.flat[item.fromKey] = [...newTodos.flat[item.fromKey], restored];
    } else {
      newTodos.priority["Med"] = [...newTodos.priority["Med"], restored];
    }
    persist({ ...data, todos: newTodos, completed: newCompleted });
  };

  // ─── CATEGORY MANAGEMENT (todos) ───
  const handleManageCategories = ({ finalOrder, renames, deletions, additions }) => {
    const newTodos = JSON.parse(JSON.stringify(data.todos));
    const newCollapsed = { ...data.collapsed };
    let newCompleted = [...data.completed];
    Object.entries(renames).forEach(([oldName, newName]) => {
      if (newTodos.flat[oldName]) { newTodos.flat[newName] = newTodos.flat[oldName]; delete newTodos.flat[oldName]; }
      if (newCollapsed[oldName] !== undefined) { newCollapsed[newName] = newCollapsed[oldName]; delete newCollapsed[oldName]; }
      newCompleted = newCompleted.map(item => item.fromSection === "flat" && item.fromKey === oldName ? { ...item, fromKey: newName } : item);
    });
    deletions.forEach(cat => { delete newTodos.flat[cat]; delete newCollapsed[cat]; });
    additions.forEach(cat => { if (!newTodos.flat[cat]) newTodos.flat[cat] = []; });
    const reorderedFlat = {};
    finalOrder.forEach(name => { reorderedFlat[name] = newTodos.flat[name] || []; });
    persist({ ...data, todos: { ...newTodos, flat: reorderedFlat }, collapsed: newCollapsed, completed: newCompleted, flatCategories: finalOrder });
    setModal(null);
  };

  // ─── NOTES CRUD ───
  const getWeekNotes = () => (data.notes || {})[viewingMonday] || {};

  const addNoteEntry = (category, text) => {
    const notes = JSON.parse(JSON.stringify(data.notes || {}));
    if (!notes[viewingMonday]) notes[viewingMonday] = {};
    if (!notes[viewingMonday][category]) notes[viewingMonday][category] = [];
    const now = Date.now();
    notes[viewingMonday][category].push({ id: uid(), text, createdAt: now, updatedAt: now });
    persist({ ...data, notes });
    setModal(null);
  };

  const editNoteEntry = (category, entryId, text) => {
    const notes = JSON.parse(JSON.stringify(data.notes || {}));
    const catEntries = notes[viewingMonday]?.[category];
    if (!catEntries) return;
    const idx = catEntries.findIndex(e => e.id === entryId);
    if (idx === -1) return;
    catEntries[idx] = { ...catEntries[idx], text, updatedAt: Date.now() };
    persist({ ...data, notes });
    setModal(null);
  };

  const deleteNoteEntry = (category, entryId) => {
    const notes = JSON.parse(JSON.stringify(data.notes || {}));
    const catEntries = notes[viewingMonday]?.[category];
    if (!catEntries) return;
    notes[viewingMonday][category] = catEntries.filter(e => e.id !== entryId);
    persist({ ...data, notes });
    setModal(null);
  };

  // ─── NOTE CATEGORY MANAGEMENT ───
  const handleManageNoteCategories = ({ finalOrder, renames, deletions, additions }) => {
    const notes = JSON.parse(JSON.stringify(data.notes || {}));
    const newNoteCollapsed = { ...(data.noteCollapsed || {}) };
    // Apply renames and deletions across ALL weeks
    Object.keys(notes).forEach(weekKey => {
      Object.entries(renames).forEach(([oldName, newName]) => {
        if (notes[weekKey][oldName]) { notes[weekKey][newName] = notes[weekKey][oldName]; delete notes[weekKey][oldName]; }
      });
      deletions.forEach(cat => { delete notes[weekKey][cat]; });
    });
    Object.entries(renames).forEach(([oldName, newName]) => {
      if (newNoteCollapsed[oldName] !== undefined) { newNoteCollapsed[newName] = newNoteCollapsed[oldName]; delete newNoteCollapsed[oldName]; }
    });
    deletions.forEach(cat => { delete newNoteCollapsed[cat]; });
    persist({ ...data, notes, noteCategories: finalOrder, noteCollapsed: newNoteCollapsed });
    setModal(null);
  };

  // ─── DRAG & DROP (todos) ───
  const allMoveTargets = [...PRIORITIES, ...flatCategories];

  const handleDragStart = (e, section, subKey, itemId) => {
    setDragItem({ section, subKey, itemId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
    e.currentTarget.style.opacity = "0.4";
  };
  const handleDragEnd = (e) => { e.currentTarget.style.opacity = "1"; setDragItem(null); setDropTarget(null); };
  const handleDragOver = (e, section, subKey, insertIndex) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropTarget({ section, subKey, insertIndex }); };
  const handleDrop = (e, targetSection, targetSubKey, insertIndex) => {
    e.preventDefault();
    if (!dragItem) return;
    const { section: srcSection, subKey: srcSubKey, itemId } = dragItem;
    const newTodos = JSON.parse(JSON.stringify(data.todos));
    const srcList = srcSection === "priority" ? newTodos.priority[srcSubKey] : newTodos.flat[srcSubKey];
    const srcIdx = srcList.findIndex(it => it.id === itemId);
    if (srcIdx === -1) return;
    const [item] = srcList.splice(srcIdx, 1);
    const targetList = targetSection === "priority" ? newTodos.priority[targetSubKey] : newTodos.flat[targetSubKey];
    let idx = insertIndex;
    if (srcSection === targetSection && srcSubKey === targetSubKey && srcIdx < insertIndex) idx--;
    if (idx < 0) idx = 0;
    if (idx > targetList.length) idx = targetList.length;
    targetList.splice(idx, 0, item);
    persist({ ...data, todos: newTodos });
    setDragItem(null); setDropTarget(null);
  };
  const isDropHere = (section, subKey, index) => dropTarget && dropTarget.section === section && dropTarget.subKey === subKey && dropTarget.insertIndex === index;
  const dropIndicator = <div style={{ height: 2, background: "#85B7EB", borderRadius: 1, margin: "1px 8px" }} />;

  const priorityColors = {
    "Very High": { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
    High: { bg: "#FAEEDA", text: "#854F0B", border: "#FAC775" },
    Med: { bg: "#f8f8f6", text: "#666663", border: "#d4d3d0" },
    Low: { bg: "#f8f8f6", text: "#999996", border: "#d4d3d0" },
  };

  // ─── RENDER ────────────────────────────────────────────────────

  // Helper to render a single day's events (shared between mobile and desktop)
  const renderDayEvents = (day, date, opts = {}) => {
    const { compact } = opts;
    const today = isToday(date);

    // 1. Get this day's own events, filtered for visibility
    const ownItems = (data.schedule[day] || []).filter(item => {
      if (item.recurrence === "weekly") return true;
      if (item.recurrence === "biweekly") return isBiweeklyVisible(item.anchorDate, weekOffset);
      if (item.recurrence === "none") { if (!item.eventDate) return weekOffset === 0; return item.eventDate === viewingMonday; }
      return true;
    });

    // 2. Exclude events that have a day override moving them AWAY from this day
    const stayingItems = ownItems.filter(item => {
      const ovr = item.weekOverrides?.[viewingMonday];
      if (ovr && ovr.day && ovr.day !== day) return false; // moved away
      return true;
    });

    // 3. Gather events from OTHER days that have a day override moving them TO this day
    const movedInItems = [];
    DAYS.forEach(otherDay => {
      if (otherDay === day) return;
      (data.schedule[otherDay] || []).forEach(item => {
        // Must be a recurring/visible event
        if (item.recurrence === "none") return;
        if (item.recurrence === "biweekly" && !isBiweeklyVisible(item.anchorDate, weekOffset)) return;
        const ovr = item.weekOverrides?.[viewingMonday];
        if (ovr && ovr.day === day) {
          movedInItems.push({ ...item, _sourceDay: otherDay });
        }
      });
    });

    // 4. Combine and apply effective overrides, then sort
    const allItems = [...stayingItems, ...movedInItems];
    const items = sortByTime(allItems.map(getEffectiveEvent));
    const isItemSkipped = (item) => item.skipDates && item.skipDates.includes(viewingMonday);
    const fontSize = compact ? 12 : 14;
    const timeFontSize = compact ? 12 : 14;
    return (
      <div key={day} style={{
        background: today ? "#E6F1FB" : "#f8f8f6", borderRadius: "8px",
        padding: compact ? "8px 10px" : "12px 16px",
        border: today ? "0.5px solid #85B7EB" : "0.5px solid #d4d3d0",
        minHeight: compact ? 90 : 60,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: compact ? 6 : 8 }}>
          <div>
            <span style={{ fontSize: today ? 16 : 13, fontWeight: today ? 700 : 500, textDecoration: "underline", color: today ? "#185FA5" : "#1a1a1a" }}>{day}:</span>
            <span style={{ fontSize: today ? 15 : 11, fontWeight: today ? 700 : 400, color: today ? "#185FA5" : "#999996", marginLeft: 3 }}>{formatDate(date)}</span>
          </div>
          <button onClick={() => setModal({ type: "addSchedule", day })} style={{ fontSize: 16, lineHeight: 1, padding: "0 4px", border: "none", background: "transparent", color: today ? "#185FA5" : "#999996", cursor: "pointer" }} title="Add event">+</button>
        </div>
        {items.length === 0 && !compact && (
          <div style={{ fontSize: 13, color: "#999996", fontStyle: "italic", padding: "4px 0" }}>no events</div>
        )}
        {items.map(item => {
          const skipped = isItemSkipped(item);
          const hasOvr = item.weekOverrides?.[viewingMonday];
          const catColor = EVENT_CAT_COLORS[item.category] || EVENT_CAT_COLORS.Personal;
          const sourceDay = item._sourceDay || day;
          return (
            <div key={item.id} onClick={() => setModal({ type: "editSchedule", day: sourceDay, displayDay: day, item })} style={{
              fontSize, lineHeight: 1.5, marginBottom: compact ? 4 : 6, cursor: "pointer",
              opacity: skipped ? 0.5 : 1, textDecoration: skipped ? "line-through" : "none",
              borderRadius: 4, padding: compact ? "2px 4px" : "4px 8px", margin: "0 -4px",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "#f2f1ee"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ color: skipped ? "#999996" : "#1a1a1a", fontSize: timeFontSize, fontWeight: 700 }}>{item.time}{item.endTime ? `–${item.endTime}` : ""}</span>{" "}
              {compact
                ? <span style={{ fontWeight: item.bold ? 700 : 400, color: skipped ? "#999996" : catColor.text }}>{item.text}</span>
                : <Linkify style={{ fontWeight: item.bold ? 700 : 400, color: skipped ? "#999996" : catColor.text }}>{item.text}</Linkify>
              }
              <RecurrenceTag recurrence={item.recurrence} />
              {hasOvr && !skipped && <span style={{ fontSize: 10, color: "#999996", marginLeft: 3 }}>✎</span>}
              {item.notes && !compact && !skipped && (
                <div style={{ fontSize: 12, color: "#999996", marginTop: 2 }}>
                  <Linkify style={{ color: "#185FA5" }}>{item.notes}</Linkify>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const mobileDayNav = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
      <button onClick={() => {
        if (mobileDayIndex > 0) setMobileDayIndex(mobileDayIndex - 1);
        else { setWeekOffset(weekOffset - 1); setMobileDayIndex(6); }
      }} style={{ fontSize: 20, padding: "2px 10px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", fontWeight: 700 }}>&#8592;</button>
      <span style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", minWidth: 100, textAlign: "center" }}>
        {DAYS[mobileDayIndex]} {formatDate(weekDates[mobileDayIndex])}
      </span>
      <button onClick={() => {
        if (mobileDayIndex < 6) setMobileDayIndex(mobileDayIndex + 1);
        else { setWeekOffset(weekOffset + 1); setMobileDayIndex(0); }
      }} style={{ fontSize: 20, padding: "2px 10px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", fontWeight: 700 }}>&#8594;</button>
    </div>
  );

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", maxWidth: 960, margin: "0 auto", padding: isMobile ? "0.25rem 0.5rem 2rem" : "0.5rem 0 2rem" }}>

      {/* ═══ WEEKLY SCHEDULE ═══ */}
      <div style={{ marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1.5px solid #d4d3d0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: data.hideCalendar ? 0 : 10, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "underline" }}>
                {isMobile ? "Schedule" : "Weekly schedule"}
              </div>
              <button onClick={() => persist({ ...data, hideCalendar: !data.hideCalendar })} style={{
                fontSize: 11, padding: "3px 8px", background: "transparent", color: "#999996", borderColor: "#d4d3d0", cursor: "pointer",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = "#f2f1ee"; e.currentTarget.style.color = "#666663"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999996"; }}
              >{data.hideCalendar ? "Show" : "Hide"}</button>
            </div>
          </div>
          {/* Week navigation */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setWeekOffset(weekOffset - 1)} style={{ fontSize: 18, padding: "2px 8px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", fontWeight: 700 }}>&#8592;</button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} style={{ fontSize: 12, padding: "3px 8px", background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>This week</button>
            )}
            <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", minWidth: 130, textAlign: "center" }}>
              {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
              {weekOffset !== 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "#999996", marginLeft: 4 }}>({weekOffset > 0 ? "+" : ""}{weekOffset}w)</span>}
            </span>
            <button onClick={() => setWeekOffset(weekOffset + 1)} style={{ fontSize: 18, padding: "2px 8px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", fontWeight: 700 }}>&#8594;</button>
          </div>
          {/* Mobile day navigation */}
          {isMobile && !data.hideCalendar && mobileDayNav}
        </div>
        {/* Desktop: 7-column grid */}
        {!data.hideCalendar && !isMobile && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
            {DAYS.map((day, i) => renderDayEvents(day, weekDates[i], { compact: true }))}
          </div>
        )}
        {/* Mobile: single day view */}
        {!data.hideCalendar && isMobile && (
          renderDayEvents(DAYS[mobileDayIndex], weekDates[mobileDayIndex], { compact: false })
        )}
      </div>

      {/* ═══ TAB SWITCHER ═══ */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1.5px solid #d4d3d0" }}>
        {[
          { key: "todo", label: "To-Do" },
          { key: "notes", label: "Notes" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            fontSize: 14, fontWeight: activeTab === tab.key ? 600 : 400,
            padding: "8px 20px",
            background: "transparent",
            color: activeTab === tab.key ? "#185FA5" : "#999996",
            border: "none",
            borderBottom: activeTab === tab.key ? "2.5px solid #185FA5" : "2.5px solid transparent",
            cursor: "pointer",
            marginBottom: "-1.5px",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
            transition: "color 0.15s, border-color 0.15s",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ═══ TO-DO TAB ═══ */}
      {activeTab === "todo" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={() => setModal({ type: "manageCategories" })} style={{
              fontSize: 11, padding: "3px 8px", background: "transparent", color: "#999996", borderColor: "#d4d3d0", cursor: "pointer",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f2f1ee"; e.currentTarget.style.color = "#666663"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999996"; }}
            >&#9881; Categories</button>
            {(() => {
              const weekCompleted = data.completed.filter(it => it.completedWeek === viewingMonday || (!it.completedWeek && viewingMonday === getMondayStr(0)));
              return (
                <button onClick={() => persist({ ...data, showCompleted: !data.showCompleted })} style={{
                  fontSize: 11, padding: "3px 8px",
                  background: data.showCompleted ? "#EAF3DE" : "transparent",
                  color: data.showCompleted ? "#3B6D11" : "#999996",
                  borderColor: data.showCompleted ? "#C0DD97" : undefined,
                }}>Done this week ({weekCompleted.length})</button>
              );
            })()}
            <button onClick={() => persist({ ...data, showAllCompleted: !data.showAllCompleted })} style={{
              fontSize: 11, padding: "3px 8px",
              background: data.showAllCompleted ? "#EAF3DE" : "transparent",
              color: data.showAllCompleted ? "#3B6D11" : "#999996",
              borderColor: data.showAllCompleted ? "#C0DD97" : undefined,
            }}>All completed ({data.completed.length})</button>
          </div>

          {/* Weekly Tasks */}
          {(() => {
            const autoTasks = [];
            DAYS.forEach(day => {
              (data.schedule[day] || []).forEach(rawItem => {
                const item = getEffectiveEvent(rawItem);
                const effectiveDay = item.weekOverrides?.[viewingMonday]?.day || day;
                if (item.category !== "Client") return;
                if (!item.text.toLowerCase().includes("session")) return;
                if (item.excludeFromTasks) return;
                if (item.recurrence === "none" && item.eventDate !== viewingMonday) return;
                if (item.recurrence === "biweekly" && !isBiweeklyVisible(item.anchorDate, weekOffset)) return;
                if (item.skipDates && item.skipDates.includes(viewingMonday)) return;
                autoTasks.push({ id: "auto_" + item.id, text: item.text + " — progress note", sourceId: item.id, day: effectiveDay });
              });
            });
            const manualTasks = data.manualWeeklyTasks || [];
            const allWeeklyTasks = [...autoTasks, ...manualTasks.map(t => ({ ...t, id: t.id }))];
            const weekChecks = (data.weeklyTaskChecks || {})[viewingMonday] || {};
            const toggleWeeklyCheck = (taskId) => {
              const newChecks = { ...data.weeklyTaskChecks || {} };
              const wc = { ...(newChecks[viewingMonday] || {}) };
              wc[taskId] = !wc[taskId];
              newChecks[viewingMonday] = wc;
              persist({ ...data, weeklyTaskChecks: newChecks });
            };
            const deleteManualWeeklyTask = (taskId) => { persist({ ...data, manualWeeklyTasks: (data.manualWeeklyTasks || []).filter(t => t.id !== taskId) }); };
            const checkedCount = allWeeklyTasks.filter(t => weekChecks[t.id]).length;
            return (
              <div style={{ marginBottom: 12 }}>
                <div onClick={() => toggleCollapse("weeklyTasks")} style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", padding: "6px 0", borderBottom: "0.5px solid #d4d3d0" }}>
                  <CollapseArrow collapsed={data.collapsed.weeklyTasks} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>Weekly tasks</span>
                  <button onClick={e => { e.stopPropagation(); setModal({ type: "addWeeklyTask" }); }} style={{ fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none", marginLeft: 6, background: "transparent", color: "#999996", cursor: "pointer" }}>+</button>
                  <span style={{ fontSize: 11, color: "#999996", marginLeft: 4 }}>{checkedCount}/{allWeeklyTasks.length}</span>
                </div>
                {!data.collapsed.weeklyTasks && (
                  <div style={{ paddingLeft: 4, paddingTop: 6 }}>
                    {allWeeklyTasks.length === 0 && <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic" }}>no tasks this week</div>}
                    {allWeeklyTasks.map(task => {
                      const checked = weekChecks[task.id] || false;
                      return (
                        <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 8px" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleWeeklyCheck(task.id)} style={{ marginTop: 3, cursor: "pointer" }} />
                          <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1, color: checked ? "#999996" : "#1a1a1a", textDecoration: checked ? "line-through" : "none" }}>
                            {task.day && <span style={{ fontSize: 11, color: "#999996", marginRight: 4 }}>{task.day}</span>}
                            {task.text}
                          </span>
                          {task.manual && (
                            <button onClick={() => deleteManualWeeklyTask(task.id)} style={{ fontSize: 14, padding: "2px 6px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", lineHeight: 1, borderRadius: 4 }}
                              onMouseEnter={e => { e.currentTarget.style.color = "#A32D2D"; e.currentTarget.style.background = "#FCEBEB"; }}
                              onMouseLeave={e => { e.currentTarget.style.color = "#666663"; e.currentTarget.style.background = "transparent"; }}
                              title="Remove">&times;</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Anytime — by priority */}
          <div style={{ marginBottom: 12 }}>
            <div onClick={() => toggleCollapse("anytime")} style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", padding: "6px 0", borderBottom: "0.5px solid #d4d3d0" }}>
              <CollapseArrow collapsed={data.collapsed.anytime} />
              <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>Anytime — by priority</span>
            </div>
            {!data.collapsed.anytime && (
              <div style={{ paddingTop: 8, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "4px 16px" }}>
                {[["Very High", "High"], ["Med", "Low"]].map(row => row.map(priority => {
                  const pc = priorityColors[priority];
                  const items = data.todos.priority[priority] || [];
                  return (
                    <div key={priority} style={{ marginBottom: 6 }}
                      onDragOver={e => { if (items.length === 0) handleDragOver(e, "priority", priority, 0); }}
                      onDrop={e => { if (items.length === 0) handleDrop(e, "priority", priority, 0); }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: "8px", background: pc.bg, color: pc.text }}>{priority}</span>
                        <button onClick={() => setModal({ type: "addTodo", section: "priority", subKey: priority })} style={{ fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none", background: "transparent", color: "#999996", cursor: "pointer" }}>+</button>
                      </div>
                      {items.length === 0 && <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic", border: isDropHere("priority", priority, 0) ? "1px dashed #85B7EB" : "1px dashed transparent", borderRadius: 4, padding: "4px 8px" }}>nothing current</div>}
                      {items.map((item, idx) => (
                        <div key={item.id}>
                          {isDropHere("priority", priority, idx) && dropIndicator}
                          <div draggable onDragStart={e => handleDragStart(e, "priority", priority, item.id)} onDragEnd={handleDragEnd}
                            onDragOver={e => handleDragOver(e, "priority", priority, idx)} onDrop={e => handleDrop(e, "priority", priority, idx)}
                            style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 8px", cursor: "grab" }}>
                            <input type="checkbox" checked={false} onChange={() => checkTodoItem("priority", priority, item.id)} style={{ marginTop: 3, cursor: "pointer" }} />
                            <span onClick={() => setModal({ type: "editTodo", section: "priority", subKey: priority, item: { ...item, _moveTarget: "" } })}
                              style={{ fontSize: 13, fontWeight: item.bold ? 700 : 400, cursor: "pointer", lineHeight: 1.5, color: "#1a1a1a", flex: 1 }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>{item.text}</span>
                            <span style={{ fontSize: 10, color: "#999996", cursor: "grab", padding: "2px 2px", userSelect: "none" }}>&#8942;</span>
                          </div>
                          {idx === items.length - 1 && isDropHere("priority", priority, idx + 1) && dropIndicator}
                        </div>
                      ))}
                      {items.length > 0 && <div style={{ height: 4 }} onDragOver={e => handleDragOver(e, "priority", priority, items.length)} onDrop={e => handleDrop(e, "priority", priority, items.length)} />}
                    </div>
                  );
                }))}
              </div>
            )}
          </div>

          {/* Flat categories */}
          {flatCategories.map(cat => {
            const items = data.todos.flat[cat] || [];
            const cc = getCatColor(cat, flatCategories);
            return (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div onClick={() => toggleCollapse(cat)} style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", padding: "6px 0", borderBottom: "0.5px solid #d4d3d0" }}>
                  <CollapseArrow collapsed={data.collapsed[cat]} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{cat}</span>
                  <button onClick={e => { e.stopPropagation(); setModal({ type: "addTodo", section: "flat", subKey: cat }); }} style={{ fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none", marginLeft: 6, background: "transparent", color: "#999996", cursor: "pointer" }}>+</button>
                  <span style={{ fontSize: 11, color: "#999996", marginLeft: 4 }}>{items.length}</span>
                </div>
                {!data.collapsed[cat] && (
                  <div style={{ paddingLeft: 4, paddingTop: 6 }}
                    onDragOver={e => { if (items.length === 0) handleDragOver(e, "flat", cat, 0); }}
                    onDrop={e => { if (items.length === 0) handleDrop(e, "flat", cat, 0); }}>
                    {items.length === 0 && <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic", border: isDropHere("flat", cat, 0) ? "1px dashed #85B7EB" : "1px dashed transparent", borderRadius: 4, padding: "4px 8px" }}>nothing here</div>}
                    {items.map((item, idx) => (
                      <div key={item.id}>
                        {isDropHere("flat", cat, idx) && dropIndicator}
                        <div draggable onDragStart={e => handleDragStart(e, "flat", cat, item.id)} onDragEnd={handleDragEnd}
                          onDragOver={e => handleDragOver(e, "flat", cat, idx)} onDrop={e => handleDrop(e, "flat", cat, idx)}
                          style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 8px", cursor: "grab" }}>
                          <input type="checkbox" checked={false} onChange={() => checkTodoItem("flat", cat, item.id)} style={{ marginTop: 3, cursor: "pointer" }} />
                          <span onClick={() => setModal({ type: "editTodo", section: "flat", subKey: cat, item: { ...item, _moveTarget: "" } })}
                            style={{ fontSize: 13, fontWeight: item.bold ? 700 : 400, cursor: "pointer", lineHeight: 1.5, color: "#1a1a1a", flex: 1 }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>{item.text}</span>
                          <span style={{ fontSize: 10, color: "#999996", cursor: "grab", padding: "2px 2px", userSelect: "none" }}>&#8942;</span>
                        </div>
                        {idx === items.length - 1 && isDropHere("flat", cat, idx + 1) && dropIndicator}
                      </div>
                    ))}
                    {items.length > 0 && <div style={{ height: 4 }} onDragOver={e => handleDragOver(e, "flat", cat, items.length)} onDrop={e => handleDrop(e, "flat", cat, items.length)} />}
                  </div>
                )}
              </div>
            );
          })}

          {/* Completed this week */}
          {data.showCompleted && (() => {
            const weekCompleted = data.completed.filter(it => it.completedWeek === viewingMonday || (!it.completedWeek && viewingMonday === getMondayStr(0)));
            return (
              <div style={{ marginTop: 16, padding: "12px", background: "#f8f8f6", borderRadius: "8px" }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#666663", marginBottom: 8 }}>Done this week ({formatDate(weekDates[0])} – {formatDate(weekDates[6])})</div>
                {weekCompleted.length === 0 && <div style={{ fontSize: 12, color: "#999996", fontStyle: "italic" }}>nothing completed this week</div>}
                {weekCompleted.slice().reverse().map(item => (
                  <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 4px" }}>
                    <input type="checkbox" checked={true} onChange={() => uncheckCompleted(item.id)} style={{ marginTop: 3, cursor: "pointer" }} />
                    <span style={{ fontSize: 13, color: "#999996", textDecoration: "line-through", lineHeight: 1.5 }}>{item.text}</span>
                    <span style={{ fontSize: 11, color: "#999996", marginLeft: "auto", whiteSpace: "nowrap" }}>{formatCompletedDate(item.completedAt)}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* All completed */}
          {data.showAllCompleted && (
            <div style={{ marginTop: 16, padding: "12px", background: "#f8f8f6", borderRadius: "8px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#666663", marginBottom: 8 }}>All completed</div>
              {data.completed.length === 0 && <div style={{ fontSize: 12, color: "#999996", fontStyle: "italic" }}>nothing completed yet</div>}
              {data.completed.slice().reverse().map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 4px" }}>
                  <input type="checkbox" checked={true} onChange={() => uncheckCompleted(item.id)} style={{ marginTop: 3, cursor: "pointer" }} />
                  <span style={{ fontSize: 13, color: "#999996", textDecoration: "line-through", lineHeight: 1.5 }}>{item.text}</span>
                  <span style={{ fontSize: 11, color: "#999996", marginLeft: "auto", whiteSpace: "nowrap" }}>{formatCompletedDate(item.completedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ NOTES TAB ═══ */}
      {activeTab === "notes" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button onClick={() => setModal({ type: "manageNoteCategories" })} style={{
              fontSize: 11, padding: "3px 8px", background: "transparent", color: "#999996", borderColor: "#d4d3d0", cursor: "pointer",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f2f1ee"; e.currentTarget.style.color = "#666663"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#999996"; }}
            >&#9881; Categories</button>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setWeekOffset(weekOffset - 1)} style={{ fontSize: 18, padding: "2px 6px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", fontWeight: 700 }}>&#8592;</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{ fontSize: 12, padding: "3px 8px", background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>This week</button>
              )}
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
                {weekOffset !== 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "#999996", marginLeft: 4 }}>({weekOffset > 0 ? "+" : ""}{weekOffset}w)</span>}
              </span>
              <button onClick={() => setWeekOffset(weekOffset + 1)} style={{ fontSize: 18, padding: "2px 6px", border: "none", background: "transparent", color: "#666663", cursor: "pointer", fontWeight: 700 }}>&#8594;</button>
            </div>
          </div>

          {noteCategories.map(cat => {
            const weekNotes = getWeekNotes();
            const entries = weekNotes[cat] || [];
            const cc = getNoteCatColor(cat, noteCategories);
            const isCollapsed = (data.noteCollapsed || {})[cat];
            return (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div onClick={() => toggleNoteCollapse(cat)} style={{
                  display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
                  padding: "6px 0", borderBottom: "0.5px solid #d4d3d0",
                }}>
                  <CollapseArrow collapsed={isCollapsed} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{cat}</span>
                  <button onClick={e => { e.stopPropagation(); setModal({ type: "addNote", category: cat }); }} style={{
                    fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none", marginLeft: 6,
                    background: "transparent", color: "#999996", cursor: "pointer",
                  }}>+</button>
                  <span style={{ fontSize: 11, color: "#999996", marginLeft: 4 }}>{entries.length}</span>
                </div>
                {!isCollapsed && (
                  <div style={{ paddingTop: 8 }}>
                    {entries.length === 0 && (
                      <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic" }}>
                        no entries this week
                      </div>
                    )}
                    {entries.map(entry => (
                      <div key={entry.id} style={{
                        padding: "10px 14px", marginBottom: 8,
                        background: cc.bg, borderRadius: 8,
                        borderLeft: `3px solid ${cc.text}`,
                        cursor: "pointer",
                        transition: "box-shadow 0.15s",
                      }}
                        onClick={() => setModal({ type: "editNote", category: cat, entry })}
                        onMouseEnter={e => e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.08)"}
                        onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
                      >
                        <div style={{ fontSize: 13, lineHeight: 1.65, color: "#1a1a1a", whiteSpace: "pre-wrap" }}>
                          <Linkify>{entry.text}</Linkify>
                        </div>
                        <div style={{ fontSize: 11, color: cc.text, marginTop: 6, opacity: 0.7 }}>
                          {formatNoteTimestamp(entry.createdAt)}
                          {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
                            <span style={{ marginLeft: 8 }}>(edited {formatNoteTimestamp(entry.updatedAt)})</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {noteCategories.length === 0 && (
            <div style={{ fontSize: 13, color: "#999996", fontStyle: "italic", padding: "20px 0", textAlign: "center" }}>
              No categories yet. Click ⚙ Categories to add some.
            </div>
          )}
        </div>
      )}

      {/* ═══ MODALS ═══ */}
      {modal?.type === "addSchedule" && (
        <Modal onClose={() => setModal(null)}>
          <ScheduleItemForm onSave={item => addScheduleItem(modal.day, item)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "editSchedule" && (
        <Modal onClose={() => setModal(null)}>
          <ScheduleItemForm item={modal.item}
            dayKey={modal.displayDay || modal.day}
            isRecurring={modal.item.recurrence !== "none"}
            isSkipped={modal.item.skipDates && modal.item.skipDates.includes(viewingMonday)}
            hasOverride={!!modal.item.weekOverrides?.[viewingMonday]}
            onSave={updates => editScheduleItem(modal.day, modal.item.id, updates)}
            onSaveOverride={overrideFields => saveScheduleOverride(modal.day, modal.item.id, overrideFields)}
            onRevertOverride={() => revertScheduleOverride(modal.day, modal.item.id)}
            onCancel={() => setModal(null)}
            onDelete={() => deleteScheduleItem(modal.day, modal.item.id)}
            onSkip={() => toggleSkipScheduleItem(modal.day, modal.item.id)} />
        </Modal>
      )}
      {modal?.type === "addTodo" && (
        <Modal onClose={() => setModal(null)}>
          <TodoItemForm onSave={item => addTodoItem(modal.section, modal.subKey, item)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "editTodo" && (
        <Modal onClose={() => setModal(null)}>
          <TodoItemForm item={modal.item}
            categories={allMoveTargets.filter(c => c !== modal.subKey)}
            onSave={updates => editTodoItem(modal.section, modal.subKey, modal.item.id, updates)}
            onCancel={() => setModal(null)}
            onDelete={() => deleteTodoItem(modal.section, modal.subKey, modal.item.id)} />
        </Modal>
      )}
      {modal?.type === "addWeeklyTask" && (
        <Modal onClose={() => setModal(null)}>
          {(() => {
            const WeeklyTaskForm = () => {
              const [text, setText] = useState("");
              const ref = useRef(null);
              useEffect(() => { ref.current?.focus(); }, []);
              const handleSave = () => {
                if (text.trim()) {
                  persist({ ...data, manualWeeklyTasks: [...(data.manualWeeklyTasks || []), { id: uid(), text: text.trim(), manual: true }] });
                  setModal(null);
                }
              };
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>New weekly task</div>
                  <input ref={ref} placeholder="e.g. Submit timesheet" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleSave(); }} />
                  <div style={{ fontSize: 12, color: "#999996" }}>This task will appear every week in your weekly tasks list.</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setModal(null)}>Cancel</button>
                    <button onClick={handleSave} style={{ background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Add</button>
                  </div>
                </div>
              );
            };
            return <WeeklyTaskForm />;
          })()}
        </Modal>
      )}
      {modal?.type === "manageCategories" && (
        <Modal onClose={() => setModal(null)}>
          <ManageCategoriesModal
            title="Manage to-do categories"
            description="Drag to reorder, rename inline, or remove categories. Deleting a category also deletes its items."
            categories={flatCategories}
            palette={FLAT_CAT_PALETTE}
            reservedNames={PRIORITIES}
            onSave={handleManageCategories}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === "manageNoteCategories" && (
        <Modal onClose={() => setModal(null)}>
          <ManageCategoriesModal
            title="Manage note categories"
            description="Drag to reorder, rename inline, or remove categories. Deleting a category deletes all its entries across all weeks."
            categories={noteCategories}
            palette={NOTE_CAT_PALETTE}
            reservedNames={[]}
            onSave={handleManageNoteCategories}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === "addNote" && (
        <Modal onClose={() => setModal(null)}>
          <NoteEntryForm
            onSave={text => addNoteEntry(modal.category, text)}
            onCancel={() => setModal(null)}
            todoCategories={[
              ...PRIORITIES.map(p => ({ name: p, label: `⚡ ${p}`, section: "priority", ...priorityColors[p] })),
              ...flatCategories.map(c => ({ name: c, label: c, section: "flat", ...getCatColor(c, flatCategories) })),
            ]}
            onAddTodo={(todoText, cat) => {
              const newItem = { id: uid(), text: todoText, bold: false, checked: false };
              const newTodos = JSON.parse(JSON.stringify(data.todos));
              if (cat.section === "priority") newTodos.priority[cat.name] = [...(newTodos.priority[cat.name] || []), newItem];
              else newTodos.flat[cat.name] = [...(newTodos.flat[cat.name] || []), newItem];
              persist({ ...data, todos: newTodos });
            }}
          />
        </Modal>
      )}
      {modal?.type === "editNote" && (
        <Modal onClose={() => setModal(null)}>
          <NoteEntryForm
            entry={modal.entry}
            onSave={text => editNoteEntry(modal.category, modal.entry.id, text)}
            onCancel={() => setModal(null)}
            onDelete={() => deleteNoteEntry(modal.category, modal.entry.id)}
            todoCategories={[
              ...PRIORITIES.map(p => ({ name: p, label: `⚡ ${p}`, section: "priority", ...priorityColors[p] })),
              ...flatCategories.map(c => ({ name: c, label: c, section: "flat", ...getCatColor(c, flatCategories) })),
            ]}
            onAddTodo={(todoText, cat) => {
              const newItem = { id: uid(), text: todoText, bold: false, checked: false };
              const newTodos = JSON.parse(JSON.stringify(data.todos));
              if (cat.section === "priority") newTodos.priority[cat.name] = [...(newTodos.priority[cat.name] || []), newItem];
              else newTodos.flat[cat.name] = [...(newTodos.flat[cat.name] || []), newItem];
              persist({ ...data, todos: newTodos });
            }}
          />
        </Modal>
      )}
    </div>
  );
}
