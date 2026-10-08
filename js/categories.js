/* Ravan categories — ids must match backend/apps-script/Code.gs and server/dev-server.js */
window.RAVAN_CATEGORIES = [
  { id: 'anger',           emoji: '😤', label: 'Anger' },
  { id: 'laziness',        emoji: '😴', label: 'Laziness' },
  { id: 'fear',            emoji: '😰', label: 'Fear' },
  { id: 'overthinking',    emoji: '🤔', label: 'Overthinking' },
  { id: 'distraction',     emoji: '📱', label: 'Distraction' },
  { id: 'negativity',      emoji: '🗣️', label: 'Negativity' },
  { id: 'ego',             emoji: '👑', label: 'Ego' },
  { id: 'procrastination', emoji: '⏰', label: 'Procrastination' },
  { id: 'blame',           emoji: '🙈', label: 'Blame Game' },
  { id: 'notmyjob',        emoji: '🚫', label: '“Not My Job” Attitude' },
  { id: 'other',           emoji: '✍️', label: 'Something Else' }
];

window.categoryById = function (id) {
  for (var i = 0; i < window.RAVAN_CATEGORIES.length; i++) {
    if (window.RAVAN_CATEGORIES[i].id === id) return window.RAVAN_CATEGORIES[i];
  }
  return { id: 'other', emoji: '✍️', label: 'Something Else' };
};
