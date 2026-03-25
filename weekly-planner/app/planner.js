'use client';

import { useState, useEffect, useCallback, useRef } from "react";
import { loadPlannerData, savePlannerData } from '../lib/supabase';

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRIORITIES = ["Very High", "High", "Med", "Low"];
const FLAT_CATEGORIES = ["School", "Friends", "Buy"];
const RECURRENCE_OPTIONS = ["none", "weekly", "biweekly"];
const EVENT_CATEGORIES = ["Client", "Class", "Personal"];
const EVENT_CAT_COLORS = {
  Client: { text: "#185FA5", light: "#E6F1FB" },
  Class: { text: "#0F6E56", light: "#E1F5EE" },
  Personal: { text: "#1a1a1a", light: "#f2f1ee" },
};

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
    flat: FLAT_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: [] }), {}),
  },
  completed: [],
  collapsed: {},
  showCompleted: false,
  showAllCompleted: false,
  weekOffset: 0,
  manualWeeklyTasks: [],
  weeklyTaskChecks: {},
});

const sampleData = () => {
  const data = defaultData();
  const thisMonday = getMondayStr(0);
  data.schedule = {
    Mon: [
      { id: uid(), time: "9:00am", endTime: "", text: "Call Tonya", recurrence: "none", bold: false, eventDate: thisMonday, category: "Personal" },
      { id: uid(), time: "11:00am", endTime: "", text: "Sophie Session", recurrence: "biweekly", bold: false, anchorDate: thisMonday, category: "Client", excludeFromTasks: true },
      { id: uid(), time: "1:00pm", endTime: "", text: "MM2 Session", recurrence: "weekly", bold: false, category: "Client" },
      { id: uid(), time: "2:00pm", endTime: "", text: "LT Session SCCC", recurrence: "weekly", bold: false, category: "Client" },
    ],
    Tue: [
      { id: uid(), time: "2:00pm", endTime: "", text: "STC Session", recurrence: "weekly", bold: false, category: "Client" },
      { id: uid(), time: "3:00pm", endTime: "", text: "VA Session", recurrence: "weekly", bold: false, category: "Client" },
    ],
    Wed: [
      { id: uid(), time: "11:00am", endTime: "1:00pm", text: "Group Supervision", recurrence: "weekly", bold: false, category: "Class" },
      { id: uid(), time: "2:00pm", endTime: "", text: "MB Session", recurrence: "biweekly", bold: false, anchorDate: thisMonday, category: "Client" },
      { id: uid(), time: "3:00pm", endTime: "", text: "MM Session", recurrence: "weekly", bold: false, category: "Client" },
      { id: uid(), time: "PM", endTime: "", text: "Date Night", recurrence: "weekly", bold: false, category: "Personal" },
    ],
    Thu: [
      { id: uid(), time: "11:00am", endTime: "", text: "JF Session", recurrence: "weekly", bold: false, category: "Client" },
      { id: uid(), time: "12:00pm", endTime: "", text: "Drop-in Session w/ Ben", recurrence: "none", bold: false, eventDate: thisMonday, category: "Personal" },
      { id: uid(), time: "4:00pm", endTime: "6:00pm", text: "SCCC Training", recurrence: "weekly", bold: false, category: "Class" },
    ],
    Fri: [
      { id: uid(), time: "9:00am", endTime: "", text: "Intake Available", recurrence: "none", bold: false, eventDate: thisMonday, category: "Client" },
      { id: uid(), time: "12:00pm", endTime: "", text: "Lunch w/ Chris", recurrence: "none", bold: false, eventDate: thisMonday, category: "Personal" },
      { id: uid(), time: "2:00pm", endTime: "", text: "SG Session", recurrence: "weekly", bold: false, category: "Client" },
    ],
    Sat: [
      { id: uid(), time: "10:00am", endTime: "", text: "Beach Workout", recurrence: "none", bold: false, eventDate: thisMonday, category: "Personal" },
    ],
    Sun: [
      { id: uid(), time: "8:00am", endTime: "", text: "Church", recurrence: "none", bold: false, eventDate: thisMonday, category: "Personal" },
    ],
  };
  data.todos.priority = {
    "Very High": [
      { id: uid(), text: "Delete Facebook", bold: false, checked: false },
      { id: uid(), text: "Create new Facebook for therapist groups", bold: false, checked: false },
      { id: uid(), text: "Taxes (week of March 16)", bold: false, checked: false },
      { id: uid(), text: "Marriage certificate", bold: false, checked: false },
      { id: uid(), text: "Dads keys", bold: false, checked: false },
      { id: uid(), text: "Contribute to IRA", bold: false, checked: false },
    ],
    High: [
      { id: uid(), text: "Research Honeymoon", bold: false, checked: false },
      { id: uid(), text: "Wedding band research", bold: false, checked: false },
      { id: uid(), text: "Advance directive", bold: false, checked: false },
      { id: uid(), text: "Research HIPAA-compliant software for notes/scheduling", bold: false, checked: false },
      { id: uid(), text: "Add ring to homeowners insurance (or USAA)", bold: false, checked: false },
      { id: uid(), text: "Replace air filter in bedroom", bold: false, checked: false },
    ],
    Med: [],
    Low: [
      { id: uid(), text: "Research theater therapy groups in LA", bold: false, checked: false },
      { id: uid(), text: "Update Mac OS", bold: false, checked: false },
      { id: uid(), text: "Backup wired headphones", bold: false, checked: false },
      { id: uid(), text: "Notebook for SCCC", bold: false, checked: false },
    ],
  };
  return data;
};

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

function Modal({ children, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      padding: "1rem",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#f5f5f4",
        border: "1px solid #b4b2a9",
        borderRadius: "12px",
        padding: "1.5rem", width: "100%", maxWidth: 400,
        boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
        position: "relative", zIndex: 1001,
      }}>
        {children}
      </div>
    </div>
  );
}

function ScheduleItemForm({ item, onSave, onCancel, onDelete, onSkip, isSkipped, isRecurring }) {
  const [time, setTime] = useState(item?.time || "");
  const [endTime, setEndTime] = useState(item?.endTime || "");
  const [text, setText] = useState(item?.text || "");
  const [recurrence, setRecurrence] = useState(item?.recurrence || "none");
  const [category, setCategory] = useState(item?.category || "Personal");
  const [excludeFromTasks, setExcludeFromTasks] = useState(item?.excludeFromTasks || false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const showsAsSession = text.toLowerCase().includes("session") && category === "Client";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{item ? "Edit event" : "New event"}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input ref={inputRef} placeholder="Start (e.g. 9:00am)" value={time} onChange={e => setTime(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="End (optional)" value={endTime} onChange={e => setEndTime(e.target.value)} style={{ flex: 1 }} />
      </div>
      <input placeholder="Description" value={text} onChange={e => setText(e.target.value)} />
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
      {showsAsSession && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#666663", cursor: "pointer" }}>
          <input type="checkbox" checked={excludeFromTasks} onChange={e => setExcludeFromTasks(e.target.checked)} />
          No progress note needed
        </label>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
        {item && onDelete && <button onClick={onDelete} style={{ color: "#A32D2D", borderColor: "#F09595", marginRight: "auto" }}>Delete</button>}
        {item && isRecurring && onSkip && (
          <button onClick={onSkip} style={{
            fontSize: 12, padding: "4px 10px", marginRight: "auto",
            background: isSkipped ? "#EAF3DE" : "#FAEEDA",
            color: isSkipped ? "#3B6D11" : "#854F0B",
            borderColor: isSkipped ? "#C0DD97" : "#FAC775",
          }}>{isSkipped ? "Unskip this week" : "Skip this week"}</button>
        )}
        <button onClick={onCancel}>Cancel</button>
        <button onClick={() => { if (text.trim()) onSave({ time, endTime, text, recurrence, category, excludeFromTasks }); }} style={{ background: "#E6F1FB", color: "#185FA5", borderColor: "#85B7EB" }}>Save</button>
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

function RecurrenceTag({ recurrence }) {
  if (recurrence === "none") return null;
  return (
    <span style={{
      fontSize: 11, fontWeight: 400, color: "#999996",
      marginLeft: 3,
    }}>
      {recurrence === "weekly" ? "(R)" : "(R2)"}
    </span>
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

export default function Planner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    loadData().then(loaded => {
      setData(loaded || sampleData());
      setLoading(false);
    });
  }, []);

  const persist = useCallback((newData) => {
    setData(newData);
    saveData(newData);
  }, []);

  const weekDates = getWeekDates(weekOffset);
  const viewingMonday = getMondayStr(weekOffset);

  if (loading) return <div style={{ padding: "2rem", color: "#666663" }}>Loading...</div>;
  if (!data) return null;

  const toggleCollapse = (key) => {
    persist({ ...data, collapsed: { ...data.collapsed, [key]: !data.collapsed[key] } });
  };

  const addScheduleItem = (dayKey, item) => {
    const newItem = { id: uid(), ...item, bold: false, category: item.category || "Personal" };
    if (item.recurrence === "none") {
      newItem.eventDate = viewingMonday;
    } else if (item.recurrence === "biweekly") {
      newItem.anchorDate = viewingMonday;
    }
    const newSchedule = { ...data.schedule, [dayKey]: sortByTime([...data.schedule[dayKey], newItem]) };
    persist({ ...data, schedule: newSchedule });
    setModal(null);
  };

  const editScheduleItem = (dayKey, itemId, updates) => {
    const items = sortByTime(data.schedule[dayKey].map(it => {
      if (it.id !== itemId) return it;
      const updated = { ...it, ...updates };
      if (updates.recurrence === "none" && !updated.eventDate) {
        updated.eventDate = viewingMonday;
      }
      if (updates.recurrence === "biweekly" && !updated.anchorDate) {
        updated.anchorDate = viewingMonday;
      }
      if (updates.recurrence === "weekly") {
        delete updated.eventDate;
        delete updated.anchorDate;
      }
      return updated;
    }));
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  const deleteScheduleItem = (dayKey, itemId) => {
    const items = data.schedule[dayKey].filter(it => it.id !== itemId);
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  const toggleSkipScheduleItem = (dayKey, itemId) => {
    const items = data.schedule[dayKey].map(it => {
      if (it.id !== itemId) return it;
      const skipDates = it.skipDates || [];
      const alreadySkipped = skipDates.includes(viewingMonday);
      return {
        ...it,
        skipDates: alreadySkipped
          ? skipDates.filter(d => d !== viewingMonday)
          : [...skipDates, viewingMonday],
      };
    });
    persist({ ...data, schedule: { ...data.schedule, [dayKey]: items } });
    setModal(null);
  };

  const addTodoItem = (section, subKey, item) => {
    const newItem = { id: uid(), text: item.text, bold: item.bold, checked: false };
    const newTodos = { ...data.todos };
    if (section === "priority") {
      newTodos.priority = { ...newTodos.priority, [subKey]: [...newTodos.priority[subKey], newItem] };
    } else {
      newTodos.flat = { ...newTodos.flat, [subKey]: [...newTodos.flat[subKey], newItem] };
    }
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
      if (section === "priority") {
        newTodos.priority[subKey] = newTodos.priority[subKey].map(it =>
          it.id === itemId ? { ...it, text: updates.text, bold: updates.bold } : it
        );
      } else {
        newTodos.flat[subKey] = newTodos.flat[subKey].map(it =>
          it.id === itemId ? { ...it, text: updates.text, bold: updates.bold } : it
        );
      }
    }
    persist({ ...data, todos: newTodos });
    setModal(null);
  };

  const deleteTodoItem = (section, subKey, itemId) => {
    const newTodos = { ...data.todos };
    if (section === "priority") {
      newTodos.priority[subKey] = newTodos.priority[subKey].filter(it => it.id !== itemId);
    } else {
      newTodos.flat[subKey] = newTodos.flat[subKey].filter(it => it.id !== itemId);
    }
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
    const completedItem = {
      ...item, checked: true, completedAt: Date.now(),
      completedWeek: viewingMonday,
      fromSection: section, fromKey: subKey,
    };
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

  const allMoveTargets = [...PRIORITIES, ...FLAT_CATEGORIES];

  const handleDragStart = (e, section, subKey, itemId) => {
    setDragItem({ section, subKey, itemId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
    e.currentTarget.style.opacity = "0.4";
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
    setDragItem(null);
    setDropTarget(null);
  };

  const handleDragOver = (e, section, subKey, insertIndex) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ section, subKey, insertIndex });
  };

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
    setDragItem(null);
    setDropTarget(null);
  };

  const isDropHere = (section, subKey, index) =>
    dropTarget && dropTarget.section === section && dropTarget.subKey === subKey && dropTarget.insertIndex === index;

  const dropIndicator = (
    <div style={{ height: 2, background: "#85B7EB", borderRadius: 1, margin: "1px 8px" }} />
  );

  const priorityColors = {
    "Very High": { bg: "#FCEBEB", text: "#A32D2D", border: "#F09595" },
    High: { bg: "#FAEEDA", text: "#854F0B", border: "#FAC775" },
    Med: { bg: "#f8f8f6", text: "#666663", border: "#d4d3d0" },
    Low: { bg: "#f8f8f6", text: "#999996", border: "#d4d3d0" },
  };

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif", maxWidth: 960, margin: "0 auto", padding: "0.5rem 0 2rem" }}>
      {/* WEEKLY SCHEDULE */}
      <div style={{ marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1.5px solid #d4d3d0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 10, gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "underline" }}>
              Weekly schedule
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setWeekOffset(weekOffset - 1)} style={{
              fontSize: 14, padding: "2px 8px", border: "none", background: "transparent",
              color: "#666663", cursor: "pointer",
            }}>&#8592;</button>
            {weekOffset !== 0 && (
              <button onClick={() => setWeekOffset(0)} style={{
                fontSize: 11, padding: "3px 8px",
                background: "#E6F1FB", color: "#185FA5",
                borderColor: "#85B7EB",
              }}>This week</button>
            )}
            <span style={{ fontSize: 12, color: "#666663", minWidth: 120, textAlign: "center" }}>
              {formatDate(weekDates[0])} – {formatDate(weekDates[6])}
              {weekOffset !== 0 && <span style={{ fontSize: 11, color: "#999996", marginLeft: 4 }}>
                ({weekOffset > 0 ? "+" : ""}{weekOffset}w)
              </span>}
            </span>
            <button onClick={() => setWeekOffset(weekOffset + 1)} style={{
              fontSize: 14, padding: "2px 8px", border: "none", background: "transparent",
              color: "#666663", cursor: "pointer",
            }}>&#8594;</button>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
          {DAYS.map((day, i) => {
            const date = weekDates[i];
            const today = isToday(date);
            const allItems = data.schedule[day] || [];
            const visibleItems = allItems.filter(item => {
              if (item.recurrence === "weekly") return true;
              if (item.recurrence === "biweekly") return isBiweeklyVisible(item.anchorDate, weekOffset);
              if (item.recurrence === "none") {
                if (!item.eventDate) return weekOffset === 0;
                return item.eventDate === viewingMonday;
              }
              return true;
            });
            const items = sortByTime(visibleItems);
            const isItemSkipped = (item) => item.skipDates && item.skipDates.includes(viewingMonday);
            return (
              <div key={day} style={{
                background: today ? "#E6F1FB" : "#f8f8f6",
                borderRadius: "8px", padding: "8px 10px",
                border: today ? "0.5px solid #85B7EB" : "0.5px solid #d4d3d0",
                minHeight: 90,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: today ? 16 : 13, fontWeight: today ? 700 : 500, textDecoration: "underline", color: today ? "#185FA5" : "#1a1a1a" }}>{day}:</span>
                    <span style={{ fontSize: today ? 15 : 11, fontWeight: today ? 700 : 400, color: today ? "#185FA5" : "#999996", marginLeft: 3 }}>{formatDate(date)}</span>
                  </div>
                  <button onClick={() => setModal({ type: "addSchedule", day })} style={{
                    fontSize: 16, lineHeight: 1, padding: "0 4px", border: "none", background: "transparent",
                    color: today ? "#185FA5" : "#999996", cursor: "pointer",
                  }} title="Add event">+</button>
                </div>
                {items.map(item => {
                  const skipped = isItemSkipped(item);
                  const catColor = EVENT_CAT_COLORS[item.category] || EVENT_CAT_COLORS.Personal;
                  return (
                  <div key={item.id} onClick={() => setModal({ type: "editSchedule", day, item })} style={{
                    fontSize: 12, lineHeight: 1.45, marginBottom: 4, cursor: "pointer",
                    opacity: skipped ? 0.5 : 1,
                    textDecoration: skipped ? "line-through" : "none",
                    borderRadius: 4, padding: "2px 4px", margin: "0 -4px",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f2f1ee"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <span style={{ color: skipped ? "#999996" : "#1a1a1a", fontSize: 12, fontWeight: 700 }}>
                      {item.time}{item.endTime ? `–${item.endTime}` : ""}
                    </span>{" "}
                    <span style={{ fontWeight: item.bold ? 700 : 400, color: skipped ? "#999996" : catColor.text }}>{item.text}</span>
                    <RecurrenceTag recurrence={item.recurrence} />
                    {skipped && <span style={{ fontSize: 10, color: "#999996", marginLeft: 3 }}>(skipped)</span>}
                  </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* TO-DO SECTION */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 16, fontWeight: 500, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.06em", textDecoration: "underline" }}>
            To-do
          </div>
          {(() => {
            const weekCompleted = data.completed.filter(it => it.completedWeek === viewingMonday || (!it.completedWeek && viewingMonday === getMondayStr(0)));
            return (
              <button onClick={() => persist({ ...data, showCompleted: !data.showCompleted })} style={{
                fontSize: 11, padding: "3px 8px",
                background: data.showCompleted ? "#EAF3DE" : "transparent",
                color: data.showCompleted ? "#3B6D11" : "#999996",
                borderColor: data.showCompleted ? "#C0DD97" : undefined,
              }}>
                Done this week ({weekCompleted.length})
              </button>
            );
          })()}
          <button onClick={() => persist({ ...data, showAllCompleted: !data.showAllCompleted })} style={{
            fontSize: 11, padding: "3px 8px",
            background: data.showAllCompleted ? "#EAF3DE" : "transparent",
            color: data.showAllCompleted ? "#3B6D11" : "#999996",
            borderColor: data.showAllCompleted ? "#C0DD97" : undefined,
          }}>
            All completed ({data.completed.length})
          </button>
        </div>

        {/* WEEKLY TASKS */}
        {(() => {
          const autoTasks = [];
          DAYS.forEach(day => {
            (data.schedule[day] || []).forEach(item => {
              if (item.category !== "Client") return;
              if (!item.text.toLowerCase().includes("session")) return;
              if (item.excludeFromTasks) return;
              if (item.recurrence === "none" && item.eventDate !== viewingMonday) return;
              if (item.recurrence === "biweekly" && !isBiweeklyVisible(item.anchorDate, weekOffset)) return;
              if (item.skipDates && item.skipDates.includes(viewingMonday)) return;
              autoTasks.push({ id: "auto_" + item.id, text: item.text + " — progress note", sourceId: item.id, day });
            });
          });
          const manualTasks = data.manualWeeklyTasks || [];
          const allWeeklyTasks = [...autoTasks, ...manualTasks.map(t => ({ ...t, id: t.id }))];
          const checks = data.weeklyTaskChecks || {};
          const weekChecks = checks[viewingMonday] || {};

          const toggleWeeklyCheck = (taskId) => {
            const newChecks = { ...data.weeklyTaskChecks || {} };
            const wc = { ...(newChecks[viewingMonday] || {}) };
            wc[taskId] = !wc[taskId];
            newChecks[viewingMonday] = wc;
            persist({ ...data, weeklyTaskChecks: newChecks });
          };

          const deleteManualWeeklyTask = (taskId) => {
            persist({ ...data, manualWeeklyTasks: (data.manualWeeklyTasks || []).filter(t => t.id !== taskId) });
          };

          const checkedCount = allWeeklyTasks.filter(t => weekChecks[t.id]).length;

          return (
            <div style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCollapse("weeklyTasks")} style={{
                display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
                padding: "6px 0", borderBottom: "0.5px solid #d4d3d0",
              }}>
                <CollapseArrow collapsed={data.collapsed.weeklyTasks} />
                <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>
                  Weekly tasks
                </span>
                <button onClick={e => { e.stopPropagation(); setModal({ type: "addWeeklyTask" }); }} style={{
                  fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none", marginLeft: 6,
                  background: "transparent", color: "#999996", cursor: "pointer",
                }}>+</button>
                <span style={{ fontSize: 11, color: "#999996", marginLeft: 4 }}>
                  {checkedCount}/{allWeeklyTasks.length}
                </span>
              </div>
              {!data.collapsed.weeklyTasks && (
                <div style={{ paddingLeft: 4, paddingTop: 6 }}>
                  {allWeeklyTasks.length === 0 && (
                    <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic" }}>no tasks this week</div>
                  )}
                  {allWeeklyTasks.map(task => {
                    const checked = weekChecks[task.id] || false;
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 8px" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleWeeklyCheck(task.id)}
                          style={{ marginTop: 3, cursor: "pointer" }} />
                        <span style={{
                          fontSize: 13, lineHeight: 1.5, flex: 1,
                          color: checked ? "#999996" : "#1a1a1a",
                          textDecoration: checked ? "line-through" : "none",
                        }}>
                          {task.day && <span style={{ fontSize: 11, color: "#999996", marginRight: 4 }}>{task.day}</span>}
                          {task.text}
                        </span>
                        {task.manual && (
                          <button onClick={() => deleteManualWeeklyTask(task.id)} style={{
                            fontSize: 14, padding: "2px 6px", border: "none", background: "transparent",
                            color: "#666663", cursor: "pointer", lineHeight: 1,
                            borderRadius: 4,
                          }}
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

        {/* ANYTIME — by priority */}
        <div style={{ marginBottom: 12 }}>
          <div onClick={() => toggleCollapse("anytime")} style={{
            display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
            padding: "6px 0", borderBottom: "0.5px solid #d4d3d0",
          }}>
            <CollapseArrow collapsed={data.collapsed.anytime} />
            <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>Anytime — by priority</span>
          </div>
          {!data.collapsed.anytime && (
            <div style={{ paddingTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
              {[["Very High", "High"], ["Med", "Low"]].map(row => row.map(priority => {
                const pc = priorityColors[priority];
                const items = data.todos.priority[priority] || [];
                return (
                  <div key={priority} style={{ marginBottom: 6 }}
                    onDragOver={e => { if (items.length === 0) handleDragOver(e, "priority", priority, 0); }}
                    onDrop={e => { if (items.length === 0) handleDrop(e, "priority", priority, 0); }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: "2px 8px",
                        borderRadius: "8px",
                        background: pc.bg, color: pc.text,
                      }}>{priority}</span>
                      <button onClick={() => setModal({ type: "addTodo", section: "priority", subKey: priority })} style={{
                        fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none",
                        background: "transparent", color: "#999996", cursor: "pointer",
                      }}>+</button>
                    </div>
                    {items.length === 0 && (
                      <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic",
                        border: isDropHere("priority", priority, 0) ? "1px dashed #85B7EB" : "1px dashed transparent",
                        borderRadius: 4, padding: "4px 8px",
                      }}>nothing current</div>
                    )}
                    {items.map((item, idx) => (
                      <div key={item.id}>
                        {isDropHere("priority", priority, idx) && dropIndicator}
                        <div draggable
                          onDragStart={e => handleDragStart(e, "priority", priority, item.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={e => handleDragOver(e, "priority", priority, idx)}
                          onDrop={e => handleDrop(e, "priority", priority, idx)}
                          style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 8px", cursor: "grab" }}>
                          <input type="checkbox" checked={false} onChange={() => checkTodoItem("priority", priority, item.id)}
                            style={{ marginTop: 3, cursor: "pointer", accentColor: pc.text === "#A32D2D" ? "#E24B4A" : undefined }} />
                          <span onClick={() => setModal({ type: "editTodo", section: "priority", subKey: priority, item: { ...item, _moveTarget: "" } })}
                            style={{ fontSize: 13, fontWeight: item.bold ? 700 : 400, cursor: "pointer", lineHeight: 1.5, color: "#1a1a1a", flex: 1 }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                            onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                          >{item.text}</span>
                          <span style={{ fontSize: 10, color: "#999996", cursor: "grab", padding: "2px 2px", userSelect: "none" }}>&#8942;</span>
                        </div>
                        {idx === items.length - 1 && isDropHere("priority", priority, idx + 1) && dropIndicator}
                      </div>
                    ))}
                    {items.length > 0 && (
                      <div style={{ height: 4 }}
                        onDragOver={e => handleDragOver(e, "priority", priority, items.length)}
                        onDrop={e => handleDrop(e, "priority", priority, items.length)} />
                    )}
                  </div>
                );
              }))}
            </div>
          )}
        </div>

        {/* FLAT CATEGORIES */}
        {FLAT_CATEGORIES.map(cat => {
          const items = data.todos.flat[cat] || [];
          const catColors = {
            School: { bg: "#EEEDFE", text: "#534AB7" },
            Friends: { bg: "#E1F5EE", text: "#0F6E56" },
            Buy: { bg: "#FAEEDA", text: "#854F0B" },
          };
          const cc = catColors[cat];
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div onClick={() => toggleCollapse(cat)} style={{
                display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none",
                padding: "6px 0", borderBottom: "0.5px solid #d4d3d0",
              }}>
                <CollapseArrow collapsed={data.collapsed[cat]} />
                <span style={{ fontSize: 14, fontWeight: 500, color: "#1a1a1a" }}>{cat}</span>
                <button onClick={e => { e.stopPropagation(); setModal({ type: "addTodo", section: "flat", subKey: cat }); }} style={{
                  fontSize: 14, lineHeight: 1, padding: "0 4px", border: "none", marginLeft: 6,
                  background: "transparent", color: "#999996", cursor: "pointer",
                }}>+</button>
                <span style={{ fontSize: 11, color: "#999996", marginLeft: 4 }}>{items.length}</span>
              </div>
              {!data.collapsed[cat] && (
                <div style={{ paddingLeft: 4, paddingTop: 6 }}
                  onDragOver={e => { if (items.length === 0) handleDragOver(e, "flat", cat, 0); }}
                  onDrop={e => { if (items.length === 0) handleDrop(e, "flat", cat, 0); }}
                >
                  {items.length === 0 && (
                    <div style={{ fontSize: 12, color: "#999996", paddingLeft: 8, fontStyle: "italic",
                      border: isDropHere("flat", cat, 0) ? "1px dashed #85B7EB" : "1px dashed transparent",
                      borderRadius: 4, padding: "4px 8px",
                    }}>nothing here</div>
                  )}
                  {items.map((item, idx) => (
                    <div key={item.id}>
                      {isDropHere("flat", cat, idx) && dropIndicator}
                      <div draggable
                        onDragStart={e => handleDragStart(e, "flat", cat, item.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={e => handleDragOver(e, "flat", cat, idx)}
                        onDrop={e => handleDrop(e, "flat", cat, idx)}
                        style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 8px", cursor: "grab" }}>
                        <input type="checkbox" checked={false} onChange={() => checkTodoItem("flat", cat, item.id)}
                          style={{ marginTop: 3, cursor: "pointer" }} />
                        <span onClick={() => setModal({ type: "editTodo", section: "flat", subKey: cat, item: { ...item, _moveTarget: "" } })}
                          style={{ fontSize: 13, fontWeight: item.bold ? 700 : 400, cursor: "pointer", lineHeight: 1.5, color: "#1a1a1a", flex: 1 }}
                          onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                          onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                        >{item.text}</span>
                        <span style={{ fontSize: 10, color: "#999996", cursor: "grab", padding: "2px 2px", userSelect: "none" }}>&#8942;</span>
                      </div>
                      {idx === items.length - 1 && isDropHere("flat", cat, idx + 1) && dropIndicator}
                    </div>
                  ))}
                  {items.length > 0 && (
                    <div style={{ height: 4 }}
                      onDragOver={e => handleDragOver(e, "flat", cat, items.length)}
                      onDrop={e => handleDrop(e, "flat", cat, items.length)} />
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* COMPLETED THIS WEEK */}
        {data.showCompleted && (() => {
          const weekCompleted = data.completed.filter(it => it.completedWeek === viewingMonday || (!it.completedWeek && viewingMonday === getMondayStr(0)));
          return (
            <div style={{ marginTop: 16, padding: "12px", background: "#f8f8f6", borderRadius: "8px" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#666663", marginBottom: 8 }}>
                Done this week ({formatDate(weekDates[0])} – {formatDate(weekDates[6])})
              </div>
              {weekCompleted.length === 0 && (
                <div style={{ fontSize: 12, color: "#999996", fontStyle: "italic" }}>nothing completed this week</div>
              )}
              {weekCompleted.slice().reverse().map(item => (
                <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 4px" }}>
                  <input type="checkbox" checked={true} onChange={() => uncheckCompleted(item.id)}
                    style={{ marginTop: 3, cursor: "pointer" }} />
                  <span style={{ fontSize: 13, color: "#999996", textDecoration: "line-through", lineHeight: 1.5 }}>
                    {item.text}
                  </span>
                  <span style={{ fontSize: 11, color: "#999996", marginLeft: "auto", whiteSpace: "nowrap" }}>
                    {formatCompletedDate(item.completedAt)}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ALL COMPLETED */}
        {data.showAllCompleted && (
          <div style={{ marginTop: 16, padding: "12px", background: "#f8f8f6", borderRadius: "8px" }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#666663", marginBottom: 8 }}>All completed</div>
            {data.completed.length === 0 && (
              <div style={{ fontSize: 12, color: "#999996", fontStyle: "italic" }}>nothing completed yet</div>
            )}
            {data.completed.slice().reverse().map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0 3px 4px" }}>
                <input type="checkbox" checked={true} onChange={() => uncheckCompleted(item.id)}
                  style={{ marginTop: 3, cursor: "pointer" }} />
                <span style={{ fontSize: 13, color: "#999996", textDecoration: "line-through", lineHeight: 1.5 }}>
                  {item.text}
                </span>
                <span style={{ fontSize: 11, color: "#999996", marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {formatCompletedDate(item.completedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODALS */}
      {modal?.type === "addSchedule" && (
        <Modal onClose={() => setModal(null)}>
          <ScheduleItemForm onSave={item => addScheduleItem(modal.day, item)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.type === "editSchedule" && (
        <Modal onClose={() => setModal(null)}>
          <ScheduleItemForm item={modal.item}
            isRecurring={modal.item.recurrence !== "none"}
            isSkipped={modal.item.skipDates && modal.item.skipDates.includes(viewingMonday)}
            onSave={updates => editScheduleItem(modal.day, modal.item.id, updates)}
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
                  const newTask = { id: uid(), text: text.trim(), manual: true };
                  persist({ ...data, manualWeeklyTasks: [...(data.manualWeeklyTasks || []), newTask] });
                  setModal(null);
                }
              };
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>New weekly task</div>
                  <input ref={ref} placeholder="e.g. Submit timesheet" value={text} onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSave(); }} />
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
    </div>
  );
}
