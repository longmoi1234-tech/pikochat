const statusText = document.getElementById('statusText');
const launchScreen = document.getElementById('launchScreen');
const chatPanel = document.getElementById('chatPanel');
const openChatBtn = document.getElementById('openChatBtn');
const backToLaunchBtn = document.getElementById('backToLaunchBtn');
const launchCategoryGrid = document.getElementById('launchCategoryGrid');
const launchQuestionPanel = document.getElementById('launchQuestionPanel');
const chatWindow = document.getElementById('chatWindow');
const chatForm = document.getElementById('chatForm');
const userInput = document.getElementById('userInput');
const emptyState = document.getElementById('emptyState');
const micBtn = document.getElementById('micBtn');
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

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
  const normalizedQuery = query.toLowerCase();
  let bestMatch = null;
  let highestScore = 0;

  faq.forEach((item) => {
    const keywords = item.keywords || [];
    const score = keywords.reduce((total, keyword) => (
      normalizedQuery.includes(String(keyword).toLowerCase()) ? total + 1 : total
    ), 0);

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

function renderLaunchCategories(faq) {
  if (!faq.length) {
    launchCategoryGrid.innerHTML = '';
    launchQuestionPanel.innerHTML = '<p class="launch-empty">No categories are available yet.</p>';
    return;
  }

  const categories = groupFaqByCategory(faq);
  launchCategoryGrid.innerHTML = '';
  launchQuestionPanel.innerHTML = '';

  Object.entries(categories).forEach(([category, questions]) => {
    const group = document.createElement('div');
    group.className = 'launch-category-group';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'launch-category-tile';
    button.dataset.category = category;
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `
      <span class="launch-plus" aria-hidden="true">+</span>
      <span class="launch-category-name">${category}</span>
    `;

    button.addEventListener('click', () => {
      activeLaunchCategory = activeLaunchCategory === category ? '' : category;
      updateLaunchCategoryState(categories);
    });

    const questionList = document.createElement('div');
    questionList.className = 'launch-category-questions';

    group.append(button, questionList);
    launchCategoryGrid.appendChild(group);
  });
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
  Array.from(launchCategoryGrid.children).forEach((group) => {
    const button = group.querySelector('.launch-category-tile');
    const questionList = group.querySelector('.launch-category-questions');
    const categoryName = button.dataset.category;
    const isActive = categoryName === activeLaunchCategory;

    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-expanded', String(isActive));
    button.querySelector('.launch-plus').textContent = isActive ? '-' : '+';

    questionList.innerHTML = '';

    if (!isActive) {
      return;
    }

    const questions = categories[categoryName] || [];
    questions.forEach((item) => {
      const details = document.createElement('details');
      details.className = 'launch-question-item';

      const summary = document.createElement('summary');
      summary.textContent = item.question;

      const answer = document.createElement('p');
      answer.textContent = item.answer;

      details.append(summary, answer);
      questionList.appendChild(details);
    });
  });
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
