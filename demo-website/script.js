const PITCH_URL = 'https://talk-to-my-agent-client.vercel.app/';

const toAbsoluteOLearyUrl = (value) => {
  if (!value) return value;
  if (value === '/') return 'https://olearyventures.com/';
  if (value.startsWith('/#')) return `https://olearyventures.com${value}`;
  if (value.startsWith('/')) return `https://olearyventures.com${value}`;
  return value;
};

document.querySelectorAll('a[href]').forEach((link) => {
  const href = link.getAttribute('href');
  const normalizedHref = toAbsoluteOLearyUrl(href);

  if (normalizedHref !== href) {
    link.setAttribute('href', normalizedHref);
  }
});

const pitchSelectors = [
  'a[href="#pitchApplication"]',
  'a[href^="#elementor-action%3Aaction%3Dpopup%3Aopen%26settings%3DeyJpZCI6IjY2NyI"]',
];

document.querySelectorAll(pitchSelectors.join(',')).forEach((link) => {
  link.setAttribute('href', PITCH_URL);
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noreferrer');
  link.classList.add('pitch-link');

  const textNode = link.querySelector('.elementor-button-text');
  if (textNode) {
    textNode.textContent = 'Pitch Now';
  } else {
    link.textContent = 'Pitch Now';
  }
});
