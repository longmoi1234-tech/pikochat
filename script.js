const statusText = document.getElementById('statusText');
const launchScreen = document.getElementById('launchScreen');
const chatPanel = document.getElementById('chatPanel');
const openChatBtn = document.getElementById('openChatBtn');
const backToLaunchBtn = document.getElementById('backToLaunchBtn');
const launchCategoryGrid = document.getElementById('launchCategoryGrid');
const categoryPrevBtn = document.getElementById('categoryPrevBtn');
const categoryNextBtn = document.getElementById('categoryNextBtn');
const launchQuestionPanel = document.getElementById('launchQuestionPanel');
const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const emptyState = document.getElementById('emptyState');
const sendBtn = chatForm.querySelector('.send-btn');
const menuBtn = document.getElementById('menuBtn');
const historyPanel = document.getElementById('historyPanel');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const sidebarScrim = document.getElementById('sidebarScrim');
const historySearch = document.getElementById('historySearch');
const historyList = document.getElementById('historyList');
const newChatBtn = document.getElementById('newChatBtn');
const HISTORY_STORAGE_KEY = 'pikochat.conversations';
const ACTIVE_CONVERSATION_KEY = 'pikochat.activeConversationId';
const SIDEBAR_STATE_KEY = 'pikochat.sidebarOpen';
const MAX_TEXTAREA_HEIGHT = 180;
const MIN_REPLY_DELAY_MS = 3000;
const fallbackSuggestions = [
  'What is Pikonik?',
  'Does Pikonik support UPI?',
  'How to create a bill?',
  'Cafe management features',
];
const stopWords = new Set([
  'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in',
  'is', 'it', 'my', 'of', 'on', 'or', 'should', 'the', 'to', 'what',
  'when', 'where', 'which', 'who', 'why', 'with',
]);

const categoryIcons = {
  Billing: 'receipt',
  'Cafe Management': 'cup',
  'Company Settings': 'building',
  'Data and Security': 'shield',
  'Display Board': 'screen',
  Expenses: 'wallet',
  'General FAQs': 'spark',
  'Getting Started': 'rocket',
  Inventory: 'box',
  'Orders': 'cart',
  'Ownership and Manager': 'users',
  Payments: 'card',
  'POS and Cafe Management': 'cup',
  Printing: 'printer',
  Receipts: 'receipt',
  'Reports and Summary': 'chart',
  Troubleshooting: 'tool',
  'Users and Permissions': 'users',
};

let isWaitingForAnswer = false;
let faqData = [];
let activeLaunchCategory = '';
let conversations = loadConversations();
let currentConversationId = localStorage.getItem(ACTIVE_CONVERSATION_KEY) || '';
let touchStartX = 0;
let touchStartY = 0;

const configuredApiBase = (window.PIKOCHAT_API_BASE || '').replace(/\/$/, '');
const isLocalPage = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const apiBases = [
  configuredApiBase,
  '',
  isLocalPage ? 'http://localhost:5000' : ''
].filter((base, index, bases) => base || index === bases.indexOf(base));

openChatBtn.addEventListener('click', () => {
  launchScreen.classList.add('is-hidden');
  chatPanel.classList.remove('is-hidden');
  renderCurrentConversation();
  renderHistory();
  applyStoredSidebarState();
  userInput.focus();
});

backToLaunchBtn.addEventListener('click', () => {
  chatPanel.classList.add('is-hidden');
  launchScreen.classList.remove('is-hidden');
  openChatBtn.focus();
});

categoryPrevBtn.addEventListener('click', () => {
  scrollLaunchCategories(-1);
});

categoryNextBtn.addEventListener('click', () => {
  scrollLaunchCategories(1);
});

launchCategoryGrid.addEventListener('scroll', updateCategoryArrowState);
window.addEventListener('resize', updateCategoryArrowState);

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitQuestion(userInput.value);
});

userInput.addEventListener('input', () => {
  resizeComposer();
});

userInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    submitQuestion(userInput.value);
  }
});

menuBtn.addEventListener('click', () => {
  setSidebarOpen(true);
});

closeHistoryBtn.addEventListener('click', () => {
  setSidebarOpen(false);
});

sidebarScrim.addEventListener('click', () => {
  setSidebarOpen(false);
});

newChatBtn.addEventListener('click', () => {
  startNewConversation();
  setSidebarOpen(false);
});

historySearch.addEventListener('input', renderHistory);

historyList.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('.history-delete-btn');
  if (deleteButton) {
    deleteConversation(deleteButton.dataset.conversationId);
    return;
  }

  const historyButton = event.target.closest('.history-item-btn');
  if (!historyButton) {
    return;
  }

  loadConversation(historyButton.dataset.conversationId);
  setSidebarOpen(false);
});

chatPanel.addEventListener('touchstart', (event) => {
  const touch = event.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

chatPanel.addEventListener('touchmove', (event) => {
  if (!touchStartX) return;

  const touch = event.touches[0];
  const deltaX = touch.clientX - touchStartX;
  const deltaY = Math.abs(touch.clientY - touchStartY);

  if (deltaY > 40) return;

  if (touchStartX < 28 && deltaX > 70) {
    setSidebarOpen(true);
    touchStartX = 0;
  } else if (chatPanel.classList.contains('is-sidebar-open') && deltaX < -70) {
    setSidebarOpen(false);
    touchStartX = 0;
  }
}, { passive: true });

chatPanel.addEventListener('touchend', () => {
  touchStartX = 0;
});

renderCurrentConversation();
renderHistory();

async function fetchSourceData() {
  setStatus('Checking backend...');

  try {
    const result = await getFaqData();
    faqData = result.faq || [];
    renderLaunchCategories(faqData);
    setStatus(faqData.length ? '' : 'FAQ is empty.');
  } catch (error) {
    setStatus(`Failed to load FAQ data: ${error.message}`);
    launchQuestionPanel.innerHTML = '<p class="launch-empty">Could not load categories. Please check that the backend is running.</p>';
  }
}

window.addEventListener('DOMContentLoaded', fetchSourceData);

function setStatus(message) {
  statusText.textContent = message;
}

async function submitQuestion(rawQuestion) {
  const question = rawQuestion.trim();
  if (!question || isWaitingForAnswer) return;

  const conversation = getOrCreateCurrentConversation(question);
  conversation.messages.push({
    role: 'user',
    content: question,
    createdAt: new Date().toISOString(),
  });
  conversation.title = conversation.title || question;
  conversation.updatedAt = new Date().toISOString();
  saveConversations();
  renderCurrentConversation();
  renderHistory();

  userInput.value = '';
  resizeComposer();
  setWaitingForAnswer(true);
  const typingIndicator = appendTypingIndicator();
  setStatus('Getting response from chatbot...');

  try {
    const answer = await getDelayedChatbotAnswer(question);
    typingIndicator.remove();
    conversation.messages.push({
      role: 'bot',
      content: answer,
      createdAt: new Date().toISOString(),
    });
    conversation.updatedAt = new Date().toISOString();
    saveConversations();
    appendMessage(answer, 'bot');
    renderHistory();
    setStatus('Ready for your next question.');
  } catch (error) {
    typingIndicator.remove();
    const errorMessage = `Sorry, something went wrong: ${error.message}`;
    conversation.messages.push({
      role: 'bot',
      content: errorMessage,
      createdAt: new Date().toISOString(),
    });
    conversation.updatedAt = new Date().toISOString();
    saveConversations();
    appendMessage(errorMessage, 'bot');
    renderHistory();
    setStatus('Could not get a response.');
  } finally {
    setWaitingForAnswer(false);
    userInput.focus();
  }
}

async function getDelayedChatbotAnswer(question) {
  const answerResult = getChatbotAnswer(question).then(
    (answer) => ({ answer }),
    (error) => ({ error })
  );

  await delay(MIN_REPLY_DELAY_MS);
  const result = await answerResult;

  if (result.error) {
    throw result.error;
  }

  return result.answer;
}

function delay(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function setWaitingForAnswer(isWaiting) {
  isWaitingForAnswer = isWaiting;
  userInput.disabled = isWaiting;
  sendBtn.disabled = isWaiting;
  chatForm.classList.toggle('is-waiting', isWaiting);
}

function appendMessage(text, role) {
  const message = document.createElement('div');
  message.className = `message ${role}`;

  if (role === 'bot' && isFallbackAnswer(text)) {
    message.appendChild(createFallbackSuggestionMessage());
  } else {
    message.textContent = text;
  }

  chatWindow.appendChild(message);
  scrollToLatest();
}

function isFallbackAnswer(text) {
  return String(text).includes('Sorry, I could not understand your question')
    && String(text).includes('Try asking:');
}

function createFallbackSuggestionMessage() {
  const wrapper = document.createElement('div');
  wrapper.className = 'fallback-suggestions';

  const apology = document.createElement('p');
  apology.textContent = 'Sorry, I could not understand your question.';

  const prompt = document.createElement('p');
  prompt.className = 'fallback-suggestions-title';
  prompt.textContent = 'Try asking:';

  const list = document.createElement('div');
  list.className = 'fallback-suggestion-list';

  fallbackSuggestions.forEach((suggestion) => {
    const button = document.createElement('button');
    button.className = 'fallback-suggestion-btn';
    button.type = 'button';
    button.textContent = suggestion;
    button.addEventListener('click', () => sendSuggestedQuestion(suggestion));
    list.appendChild(button);
  });

  wrapper.append(apology, prompt, list);
  return wrapper;
}

function sendSuggestedQuestion(question) {
  if (isWaitingForAnswer) return;

  userInput.value = question;
  resizeComposer();
  submitQuestion(question);
}

function renderCurrentConversation() {
  chatWindow.innerHTML = '';
  const conversation = getCurrentConversation();

  if (!conversation || !conversation.messages.length) {
    chatWindow.appendChild(emptyState);
    setStatus(faqData.length ? '' : statusText.textContent);
    return;
  }

  conversation.messages.forEach((message) => {
    appendMessage(message.content, message.role);
  });

  scrollToLatest();
}

function appendTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message bot typing-indicator';
  indicator.setAttribute('aria-label', 'Pikochat is typing');

  for (let index = 0; index < 3; index += 1) {
    indicator.appendChild(document.createElement('span'));
  }

  chatWindow.appendChild(indicator);
  scrollToLatest();

  return indicator;
}

function scrollToLatest() {
  requestAnimationFrame(() => {
    chatWindow.scrollTo({
      top: chatWindow.scrollHeight,
      behavior: 'smooth',
    });
  });
}

function resizeComposer() {
  userInput.style.height = 'auto';
  userInput.style.height = `${Math.min(userInput.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
}

function getCurrentConversation() {
  return conversations.find((conversation) => conversation.id === currentConversationId) || null;
}

function getOrCreateCurrentConversation(firstQuestion = '') {
  let conversation = getCurrentConversation();

  if (conversation) {
    return conversation;
  }

  conversation = {
    id: createConversationId(),
    title: firstQuestion,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
  conversations.unshift(conversation);
  currentConversationId = conversation.id;
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, currentConversationId);
  return conversation;
}

function startNewConversation() {
  currentConversationId = '';
  localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  userInput.value = '';
  resizeComposer();
  renderCurrentConversation();
  renderHistory();
  userInput.focus();
}

function loadConversation(conversationId) {
  currentConversationId = conversationId;
  localStorage.setItem(ACTIVE_CONVERSATION_KEY, currentConversationId);
  renderCurrentConversation();
  renderHistory();
  userInput.focus();
}

function deleteConversation(conversationId) {
  conversations = conversations.filter((conversation) => conversation.id !== conversationId);

  if (currentConversationId === conversationId) {
    currentConversationId = '';
    localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
    renderCurrentConversation();
  }

  saveConversations();
  renderHistory();
}

function loadConversations() {
  try {
    const savedConversations = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(savedConversations) ? savedConversations : [];
  } catch (error) {
    return [];
  }
}

function saveConversations() {
  conversations.sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(conversations));
}

function renderHistory() {
  const searchTerm = normalizeText(historySearch.value || '');
  const matchingConversations = conversations.filter((conversation) => {
    const searchableText = [
      conversation.title,
      ...conversation.messages.map((message) => message.content),
    ].join(' ');

    return !searchTerm || normalizeText(searchableText).includes(searchTerm);
  });

  historyList.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'history-title';
  title.textContent = 'Recent Questions';
  historyList.appendChild(title);

  if (!matchingConversations.length) {
    const emptyHistory = document.createElement('p');
    emptyHistory.className = 'history-empty';
    emptyHistory.textContent = searchTerm ? 'No matching conversations.' : 'No recent questions yet.';
    historyList.appendChild(emptyHistory);
    return;
  }

  const groups = groupConversationsByDate(matchingConversations);
  Object.entries(groups).forEach(([groupName, groupConversations]) => {
    if (!groupConversations.length) return;

    const section = document.createElement('section');
    section.className = 'history-group';

    const heading = document.createElement('h3');
    heading.textContent = groupName;
    section.appendChild(heading);

    groupConversations.forEach((conversation) => {
      section.appendChild(createHistoryItem(conversation));
    });

    historyList.appendChild(section);
  });
}

function createHistoryItem(conversation) {
  const row = document.createElement('div');
  row.className = 'history-item';
  row.classList.toggle('is-active', conversation.id === currentConversationId);

  const button = document.createElement('button');
  button.className = 'history-item-btn';
  button.type = 'button';
  button.dataset.conversationId = conversation.id;
  button.textContent = conversation.title || 'Untitled conversation';

  const deleteButton = document.createElement('button');
  deleteButton.className = 'history-delete-btn';
  deleteButton.type = 'button';
  deleteButton.dataset.conversationId = conversation.id;
  deleteButton.setAttribute('aria-label', `Delete ${conversation.title || 'conversation'}`);
  deleteButton.textContent = 'Delete';

  row.append(button, deleteButton);
  return row;
}

function groupConversationsByDate(conversationList) {
  const groups = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    'Older Conversations': [],
  };
  const today = startOfDay(new Date());

  conversationList.forEach((conversation) => {
    const updatedAt = startOfDay(new Date(conversation.updatedAt || conversation.createdAt));
    const ageInDays = Math.floor((today - updatedAt) / 86400000);

    if (ageInDays <= 0) {
      groups.Today.push(conversation);
    } else if (ageInDays === 1) {
      groups.Yesterday.push(conversation);
    } else if (ageInDays <= 7) {
      groups['Previous 7 Days'].push(conversation);
    } else {
      groups['Older Conversations'].push(conversation);
    }
  });

  return groups;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function createConversationId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `conversation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setSidebarOpen(isOpen) {
  chatPanel.classList.toggle('is-sidebar-open', isOpen);
  localStorage.setItem(SIDEBAR_STATE_KEY, String(isOpen));
}

function applyStoredSidebarState() {
  setSidebarOpen(localStorage.getItem(SIDEBAR_STATE_KEY) === 'true');
}

async function getChatbotAnswer(question) {
  const params = new URLSearchParams({ query: question });
  let lastError = null;

  for (const base of apiBases) {
    try {
      const response = await fetch(`${buildApiUrl(base, 'chat')}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Backend responded with ${response.status}`);
      }

      const result = await response.json();

      if (result.error) {
        throw new Error(result.error);
      }

      return result.answer;
    } catch (error) {
      lastError = error;
    }
  }

  if (faqData.length) {
    return getLocalChatbotAnswer(question, faqData);
  }

  throw lastError || new Error('Could not reach chatbot backend');
}

async function getFaqData() {
  const sources = [
    ...apiBases.map((base) => buildApiUrl(base, 'messages')),
    '../backend/pikonik_refined_faq.json',
    'backend/pikonik_refined_faq.json'
  ].filter((source, index, sourcesList) => sourcesList.indexOf(source) === index);

  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(`${source} responded with ${response.status}`);
      }

      const result = await response.json();
      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No FAQ source found');
}

function buildApiUrl(base, path) {
  return base ? `${base}/${path}` : `/${path}`;
}

function getLocalChatbotAnswer(query, faq) {
  let bestMatch = null;
  let highestScore = 0;

  faq.forEach((item) => {
    const score = scoreFaqItem(query, item);

    if (score > highestScore) {
      highestScore = score;
      bestMatch = item;
    }
  });

  if (bestMatch) {
    return bestMatch.answer;
  }

  return `Sorry, I could not understand your question.

Try asking:
${fallbackSuggestions.map((suggestion) => `- ${suggestion}`).join('\n')}`;
}

function normalizeText(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stemToken(token) {
  if (token.length > 4 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 3 && token.endsWith('es')) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith('s')) {
    return token.slice(0, -1);
  }

  return token;
}

function getSearchTerms(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return new Set();
  }

  return new Set(normalized.split(' ').filter((token) => !stopWords.has(token)).map(stemToken));
}

function getIntersectionSize(firstSet, secondSet) {
  let count = 0;
  firstSet.forEach((value) => {
    if (secondSet.has(value)) {
      count += 1;
    }
  });

  return count;
}

function isSubset(subset, set) {
  for (const value of subset) {
    if (!set.has(value)) {
      return false;
    }
  }

  return true;
}

function scoreFaqItem(query, item) {
  const normalizedQuery = normalizeText(query);
  const queryTerms = getSearchTerms(query);
  let score = 0;

  const searchableFields = [
    [item.question || '', 6],
    [(item.keywords || []).join(' '), 2],
    [item.category || '', 1],
  ];
  const questionTerms = getSearchTerms(item.question || '');
  const itemTerms = new Set();

  searchableFields.forEach(([text, weight]) => {
    const terms = getSearchTerms(text);
    terms.forEach((term) => itemTerms.add(term));
    score += getIntersectionSize(queryTerms, terms) * weight;
  });

  if (queryTerms.size && isSubset(queryTerms, itemTerms)) {
    score += 20;
  }

  if (queryTerms.size && isSubset(queryTerms, questionTerms)) {
    score += 12;
  }

  (item.keywords || []).forEach((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      return;
    }

    const keywordTerms = getSearchTerms(keyword);
    if (normalizedQuery.includes(normalizedKeyword)) {
      score += (keywordTerms.size <= 1 ? 6 : 15) + keywordTerms.size;
    } else if (keywordTerms.size && isSubset(keywordTerms, queryTerms)) {
      score += 10 + keywordTerms.size;
    }
  });

  const normalizedQuestion = normalizeText(item.question || '');
  if (normalizedQuestion && normalizedQuery.includes(normalizedQuestion)) {
    score += 25;
  }

  return score;
}

function renderLaunchCategories(faq) {
  if (!faq.length) {
    launchCategoryGrid.innerHTML = '';
    launchQuestionPanel.innerHTML = '<p class="launch-empty">No categories are available yet.</p>';
    updateCategoryArrowState();
    return;
  }

  const categories = groupFaqByCategory(faq);
  activeLaunchCategory = activeLaunchCategory || Object.keys(categories)[0] || '';
  launchCategoryGrid.innerHTML = '';
  launchQuestionPanel.innerHTML = '';

  Object.entries(categories).forEach(([category, questions]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'launch-category-chip';
    button.dataset.category = category;
    button.setAttribute('aria-pressed', String(category === activeLaunchCategory));

    const categoryIcon = document.createElement('span');
    categoryIcon.className = `launch-category-icon icon-${categoryIcons[category] || 'spark'}`;
    categoryIcon.setAttribute('aria-hidden', 'true');

    const categoryName = document.createElement('span');
    categoryName.className = 'launch-category-name';
    categoryName.textContent = category;

    const categoryCount = document.createElement('span');
    categoryCount.className = 'launch-category-count';
    categoryCount.setAttribute('aria-label', `${questions.length} questions`);
    categoryCount.textContent = questions.length;

    button.append(categoryIcon, categoryName, categoryCount);

    button.addEventListener('click', () => {
      activeLaunchCategory = category;
      updateLaunchCategoryState(categories);
      button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });

    launchCategoryGrid.appendChild(button);
  });

  updateLaunchCategoryState(categories);
  updateCategoryArrowState();
}

function groupFaqByCategory(faq) {
  return faq.reduce((groups, item) => {
    const category = item.category || 'General';
    if (!groups[category]) {
      groups[category] = [];
    }

    groups[category].push(item);
    return groups;
  }, {});
}

function updateLaunchCategoryState(categories) {
  Array.from(launchCategoryGrid.children).forEach((button) => {
    const isActive = button.dataset.category === activeLaunchCategory;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  const questions = categories[activeLaunchCategory] || [];
  launchQuestionPanel.innerHTML = '';

  if (!questions.length) {
    launchQuestionPanel.innerHTML = '<p class="launch-empty">Select a category to view questions.</p>';
    return;
  }

  const heading = document.createElement('div');
  heading.className = 'launch-question-heading';

  const headingTitle = document.createElement('span');
  headingTitle.textContent = activeLaunchCategory;

  const headingCount = document.createElement('small');
  headingCount.textContent = `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`;

  heading.append(headingTitle, headingCount);
  launchQuestionPanel.appendChild(heading);

  const questionList = document.createElement('div');
  questionList.className = 'launch-category-questions';

  questions.forEach((item, index) => {
    const questionItem = document.createElement('div');
    questionItem.className = 'launch-question-item';
    if (index === 0) {
      questionItem.classList.add('is-open');
    }

    const questionStep = document.createElement('span');
    questionStep.className = 'launch-question-step';
    questionStep.textContent = index + 1;

    const questionButton = document.createElement('button');
    questionButton.className = 'launch-question-toggle';
    questionButton.type = 'button';
    questionButton.setAttribute('aria-expanded', String(index === 0));

    const questionText = document.createElement('span');
    questionText.className = 'launch-question-text';
    questionText.textContent = item.question || 'Question';

    const questionChevron = document.createElement('span');
    questionChevron.className = 'launch-question-chevron';
    questionChevron.setAttribute('aria-hidden', 'true');

    questionButton.append(questionText, questionChevron);

    const answer = document.createElement('div');
    answer.className = 'launch-question-answer';
    answer.hidden = index !== 0;
    answer.textContent = item.answer || 'Answer is not available for this question yet.';

    questionButton.addEventListener('click', () => {
      const isOpen = questionItem.classList.toggle('is-open');
      questionButton.setAttribute('aria-expanded', String(isOpen));
      answer.hidden = !isOpen;
    });

    const questionBody = document.createElement('div');
    questionBody.className = 'launch-question-body';
    questionBody.append(questionButton, answer);

    questionItem.append(questionStep, questionBody);
    questionList.appendChild(questionItem);
  });

  launchQuestionPanel.appendChild(questionList);
}

function scrollLaunchCategories(direction) {
  const scrollAmount = Math.max(180, Math.floor(launchCategoryGrid.clientWidth * 0.75));
  launchCategoryGrid.scrollBy({
    left: scrollAmount * direction,
    behavior: 'smooth',
  });
}

function updateCategoryArrowState() {
  const maxScrollLeft = launchCategoryGrid.scrollWidth - launchCategoryGrid.clientWidth;
  const hasOverflow = maxScrollLeft > 1;
  const currentScrollLeft = launchCategoryGrid.scrollLeft;

  categoryPrevBtn.disabled = !hasOverflow || currentScrollLeft <= 1;
  categoryNextBtn.disabled = !hasOverflow || currentScrollLeft >= maxScrollLeft - 1;
}
