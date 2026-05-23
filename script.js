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
const micBtn = document.getElementById('micBtn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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

let recognition = null;
let isListening = false;
let speechErrorMessage = '';
let faqData = [];
let activeLaunchCategory = '';

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
  const question = userInput.value.trim();
  if (!question) return;

  appendUserMessage(question);
  userInput.value = '';
  setStatus('Getting response from chatbot...');

  getChatbotAnswer(question)
    .then((answer) => {
      appendBotMessage(answer);
      setStatus('Ready for your next question.');
    })
    .catch((error) => {
      appendBotMessage(`Sorry, something went wrong: ${error.message}`);
      setStatus('Could not get a response.');
    });
});

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.addEventListener('start', () => {
    isListening = true;
    speechErrorMessage = '';
    micBtn.classList.add('is-listening');
    micBtn.setAttribute('aria-label', 'Stop listening');
    setStatus('Listening...');
  });

  recognition.addEventListener('result', (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join('');

    userInput.value = transcript.trim();
  });

  recognition.addEventListener('end', () => {
    isListening = false;
    micBtn.classList.remove('is-listening');
    micBtn.setAttribute('aria-label', 'Use microphone');
    setStatus(speechErrorMessage || (userInput.value.trim() ? 'Voice captured. Review and send.' : 'Ready for your next question.'));
    userInput.focus();
  });

  recognition.addEventListener('error', (event) => {
    isListening = false;
    speechErrorMessage = getSpeechErrorMessage(event.error);
    micBtn.classList.remove('is-listening');
    setStatus(speechErrorMessage);
  });

  micBtn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }

    try {
      recognition.start();
    } catch (error) {
      setStatus('Microphone is already starting.');
    }
  });
} else {
  micBtn.disabled = true;
  micBtn.title = 'Speech input is not supported in this browser';
  micBtn.setAttribute('aria-label', 'Speech input is not supported in this browser');
}

async function fetchSourceData() {
  setStatus('Checking backend...');

  try {
    const result = await getFaqData();
    faqData = result.faq || [];
    renderLaunchCategories(faqData);
    setStatus(faqData.length ? 'Backend ready. Ask a question.' : 'Backend ready, but FAQ is empty.');
  } catch (error) {
    setStatus(`Failed to load FAQ data: ${error.message}`);
    launchQuestionPanel.innerHTML = '<p class="launch-empty">Could not load categories. Please check that the backend is running.</p>';
  }
}

window.addEventListener('DOMContentLoaded', fetchSourceData);

function setStatus(message) {
  statusText.textContent = message;
}

function appendUserMessage(text) {
  hideEmptyState();
  const message = document.createElement('div');
  message.className = 'message user';
  message.textContent = text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendBotMessage(text) {
  hideEmptyState();
  const message = document.createElement('div');
  message.className = 'message bot';
  message.textContent = text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
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

function hideEmptyState() {
  if (emptyState) {
    emptyState.remove();
  }
}

async function getFaqData() {
  const sources = [
    ...apiBases.map((base) => buildApiUrl(base, 'messages')),
    '../backend/data.json',
    'backend/data.json'
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
- What is Pikonik?
- Does Pikonik support UPI?
- How to create a bill?
- Cafe management features`;
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

function getSpeechErrorMessage(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'Microphone permission is blocked.';
  }

  if (error === 'no-speech') {
    return 'No speech heard. Try again.';
  }

  return 'Could not use microphone.';
}
