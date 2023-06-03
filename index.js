const btn = document.querySelector('.btn');
const message = document.querySelector('.message');
const sliderInput = document.querySelector('.slider-input');
const sliderValue = document.querySelector('.slider-value');

btn.addEventListener('click', () => {
message.style.display = 'block';
});

sliderInput.addEventListener('input', () => {
sliderValue.textContent = sliderInput.value;
});