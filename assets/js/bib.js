// Copies a publication's BibTeX to the clipboard when its bib button is clicked.
function copyLegacy(text) {
  var t = document.createElement('textarea');
  t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  var ok = document.execCommand('copy');
  document.body.removeChild(t);
  if (!ok) throw new Error('copy failed');
}

document.addEventListener('click', function (e) {
  var b = e.target.closest('.pub-bib');
  if (!b) return;
  var show = function (label) { b.textContent = label; setTimeout(function () { b.textContent = 'bib'; }, 1500); };
  var write = navigator.clipboard ? navigator.clipboard.writeText(b.dataset.bib) : Promise.reject();
  write.catch(function () { copyLegacy(b.dataset.bib); })
    .then(function () { show('copied'); }, function () { show('copy failed'); });
});
