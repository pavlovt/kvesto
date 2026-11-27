/**
 * Built-in texts in several languages: the runner's buttons and messages
 * (`labels`) and the validation messages (`messages`). A locale falls back to
 * its language (`pt` for `pt-BR`), then to English, one text at a time, so a
 * pack may be partial. Add or override a pack with `addLocalePack`.
 */

/** The runner's own texts. `{n}` and `{total}` are filled in where noted. */
export const ENGLISH_LABELS = {
  next: "Next",
  prev: "Back",
  complete: "Submit",
  completed: "Thank you! Your response has been recorded.",
  yes: "Yes",
  no: "No",
  moveUp: "Move up",
  moveDown: "Move down",
  keepOrder: "Keep this order",
  rankingHint: "Drag the items, or use the arrow buttons, to put them in order.",
  removeFile: "Remove",
  addItem: "Add",
  removeItem: "Remove",
  /** Title of each item of a repeating panel; `{n}` is the item number. */
  itemTitle: "Item {n}",
  uploading: "Uploading…",
  /** A slider nobody has moved yet. */
  notSet: "Not set",
  /** The list of picked tags, for screen readers. */
  selected: "Selected",
  clearSignature: "Clear",
  signed: "Signed.",
  /** Progress text; `{n}` is the current step or page, `{total}` how many there are. */
  progress: "{n} of {total}",
  progressLabel: "Progress",
  score: "Your score: {score} of {max}.",
  passed: "You passed.",
  failed: "You did not pass this time.",
  correctAnswer: "Correct answer: {answer}",
  yourAnswer: "Your answer: {answer}",
  timeLeft: "Time left: {time}",
  scoreLater: "Your score will be shared with you later.",
  errorSummary: "Please check these answers:",
  typeToSign: "Type your full name to sign",
  /** Announced after a ranking item moves. */
  rankPosition: "{item}: position {n} of {total}",
  /** Shown instead of the survey when it takes no responses, unless the survey sets `closedMessage`. */
  closedNotOpen: "This survey isn't open yet.",
  closedClosed: "This survey is closed.",
  closedFull: "This survey has all the responses it needs. Thank you!",
  closedAnswered: "You have already answered this survey. Thank you!",
  closedSignIn: "Please sign in to answer this survey.",
};
export type Labels = typeof ENGLISH_LABELS;

/** Validation messages. `{name}` placeholders are filled in by `message()`. */
export const ENGLISH_MESSAGES = {
  required: "This question is required.",
  chooseOne: "Choose one of the options.",
  chooseMany: "Choose from the options.",
  rating: "Choose a rating from {min} to {max}.",
  yesNo: "Choose yes or no.",
  matrixOne: "Choose one column in each row.",
  matrixMany: "Choose from the columns in each row.",
  matrixMissing: "Answer every row (missing: {rows}).",
  rank: "Rank every item exactly once.",
  pictureOne: "Choose one of the pictures.",
  pictureMany: "Choose from the pictures.",
  fileOne: "Attach only one file.",
  fileMax: "Attach at most {max} files.",
  fileType: '"{name}" is not an accepted file type.',
  fileSize: '"{name}" is larger than {size}.',
  uploadFailed: "Upload failed: {error}",
  readOnly: "This answer can't be changed.",
  invalid: "This answer is not valid.",
  format: "Enter a value in the expected format.",
  email: "Enter a valid email address.",
  url: "Enter a valid web address (http or https).",
  number: "Enter a number.",
  date: "Enter a date.",
  numberRange: "Enter a number {bounds}.",
  dateBetween: "Enter a date between {min} and {max}.",
  dateMin: "Enter a date on or after {min}.",
  dateMax: "Enter a date on or before {max}.",
  length: "Enter {bounds} characters.",
  count: "{verb} {bounds} {unit}.",
  verbChoose: "Choose",
  verbAttach: "Attach",
  verbAnswer: "Answer",
  unitOption: "option",
  unitOptions: "options",
  unitFile: "file",
  unitFiles: "files",
  unitRow: "row",
  unitRows: "rows",
  boundsBetween: "between {min} and {max}",
  boundsExactly: "exactly {min}",
  boundsMin: "at least {min}",
  boundsMax: "at most {max}",
  slider: "Choose a value from {min} to {max}.",
  sliderStep: "Choose a value from {min} to {max} in steps of {step}.",
  tagsList: "Choose from the list.",
  tagsOnce: "Each entry can be added once.",
  tagsMax: "Add at most {max} entries.",
  fieldRequired: "{label} is required.",
  fieldNumber: "{label}: enter a number.",
  fieldEmail: "{label}: enter a valid email address.",
  repeatMin: "Add at least {n} {unit}.",
  repeatMax: "Add at most {n} {unit}.",
  unitItem: "item",
  unitItems: "items",
  cellText: "{row}, {column}: expected text.",
  cellNumber: "{row}, {column}: enter a number.",
  cellDropdown: "{row}, {column}: choose one of the options.",
  cellBoolean: "{row}, {column}: choose yes or no.",
  cellRequired: "{row}: {column} is required.",
};
export type Messages = typeof ENGLISH_MESSAGES;
export type MessageKey = keyof Messages;

export interface LocalePack {
  labels?: Partial<Labels>;
  messages?: Partial<Messages>;
}

const packs: Record<string, LocalePack> = {
  en: { labels: ENGLISH_LABELS, messages: ENGLISH_MESSAGES },
  bg: {
    labels: {
      next: "Напред", prev: "Назад", complete: "Изпрати", completed: "Благодарим ви! Отговорът ви е записан.", yes: "Да", no: "Не",
      moveUp: "Нагоре", moveDown: "Надолу", keepOrder: "Запази този ред", rankingHint: "Подредете елементите с плъзгане или със стрелките.",
      removeFile: "Премахни", addItem: "Добави", removeItem: "Премахни", itemTitle: "Елемент {n}", uploading: "Качване…", notSet: "Не е избрано",
      selected: "Избрани", clearSignature: "Изчисти", signed: "Подписано.", progress: "{n} от {total}", progressLabel: "Напредък",
      score: "Вашият резултат: {score} от {max}.", passed: "Издържахте.", failed: "Този път не издържахте.", correctAnswer: "Верен отговор: {answer}", yourAnswer: "Вашият отговор: {answer}", timeLeft: "Оставащо време: {time}", scoreLater: "Резултатът ще ви бъде съобщен по-късно.",
      errorSummary: "Моля, проверете тези отговори:", typeToSign: "Напишете пълното си име, за да подпишете",
      rankPosition: "{item}: позиция {n} от {total}",
      closedNotOpen: "Анкетата още не е отворена.", closedClosed: "Анкетата е затворена.", closedFull: "Анкетата събра нужните отговори. Благодарим!",
      closedAnswered: "Вече сте отговорили на тази анкета. Благодарим!", closedSignIn: "Влезте в профила си, за да отговорите.",
    },
    messages: {
      required: "Този въпрос е задължителен.", chooseOne: "Изберете една от възможностите.", chooseMany: "Изберете от възможностите.",
      rating: "Изберете оценка от {min} до {max}.", yesNo: "Изберете да или не.", matrixOne: "Изберете по една колона на всеки ред.",
      matrixMany: "Изберете от колоните на всеки ред.", matrixMissing: "Отговорете на всеки ред (липсват: {rows}).", rank: "Подредете всеки елемент точно веднъж.",
      pictureOne: "Изберете една от снимките.", pictureMany: "Изберете от снимките.", fileOne: "Прикачете само един файл.", fileMax: "Прикачете най-много {max} файла.",
      fileType: "„{name}“ не е разрешен тип файл.", fileSize: "„{name}“ е по-голям от {size}.", uploadFailed: "Качването не успя: {error}",
      readOnly: "Този отговор не може да се променя.", invalid: "Този отговор не е валиден.", format: "Въведете стойност в очаквания формат.",
      email: "Въведете валиден имейл адрес.", url: "Въведете валиден уеб адрес (http или https).", number: "Въведете число.", date: "Въведете дата.",
      numberRange: "Въведете число {bounds}.", dateBetween: "Въведете дата между {min} и {max}.", dateMin: "Въведете дата на или след {min}.",
      dateMax: "Въведете дата на или преди {max}.", length: "Въведете {bounds} знака.", verbChoose: "Изберете", verbAttach: "Прикачете", verbAnswer: "Отговорете на",
      unitOption: "възможност", unitOptions: "възможности", unitFile: "файл", unitFiles: "файла", unitRow: "ред", unitRows: "реда",
      boundsBetween: "между {min} и {max}", boundsExactly: "точно {min}", boundsMin: "поне {min}", boundsMax: "най-много {max}",
      slider: "Изберете стойност от {min} до {max}.", sliderStep: "Изберете стойност от {min} до {max} през {step}.", tagsList: "Изберете от списъка.",
      tagsOnce: "Всеки запис може да се добави веднъж.", tagsMax: "Добавете най-много {max} записа.", fieldRequired: "{label} е задължително.",
      fieldNumber: "{label}: въведете число.", fieldEmail: "{label}: въведете валиден имейл адрес.", repeatMin: "Добавете поне {n} {unit}.",
      repeatMax: "Добавете най-много {n} {unit}.", unitItem: "елемент", unitItems: "елемента", cellText: "{row}, {column}: очаква се текст.",
      cellNumber: "{row}, {column}: въведете число.", cellDropdown: "{row}, {column}: изберете една от възможностите.", cellBoolean: "{row}, {column}: изберете да или не.",
      cellRequired: "{row}: {column} е задължително.",
    },
  },
  de: {
    labels: {
      next: "Weiter", prev: "Zurück", complete: "Absenden", completed: "Vielen Dank! Ihre Antwort wurde gespeichert.", yes: "Ja", no: "Nein",
      moveUp: "Nach oben", moveDown: "Nach unten", keepOrder: "Diese Reihenfolge behalten", rankingHint: "Ziehen Sie die Einträge oder nutzen Sie die Pfeile, um sie zu ordnen.",
      removeFile: "Entfernen", addItem: "Hinzufügen", removeItem: "Entfernen", itemTitle: "Eintrag {n}", uploading: "Wird hochgeladen…", notSet: "Nicht gesetzt",
      selected: "Ausgewählt", clearSignature: "Löschen", signed: "Unterschrieben.", progress: "{n} von {total}", progressLabel: "Fortschritt",
      score: "Ihre Punktzahl: {score} von {max}.", passed: "Bestanden.", failed: "Diesmal leider nicht bestanden.", correctAnswer: "Richtige Antwort: {answer}", yourAnswer: "Ihre Antwort: {answer}", timeLeft: "Verbleibende Zeit: {time}", scoreLater: "Ihr Ergebnis wird Ihnen später mitgeteilt.",
      errorSummary: "Bitte prüfen Sie diese Antworten:", typeToSign: "Geben Sie zum Unterschreiben Ihren vollen Namen ein",
      rankPosition: "{item}: Platz {n} von {total}",
      closedNotOpen: "Diese Umfrage ist noch nicht geöffnet.", closedClosed: "Diese Umfrage ist geschlossen.", closedFull: "Diese Umfrage hat alle nötigen Antworten. Danke!",
      closedAnswered: "Sie haben diese Umfrage bereits beantwortet. Danke!", closedSignIn: "Bitte melden Sie sich an, um die Umfrage zu beantworten.",
    },
    messages: {
      required: "Diese Frage ist erforderlich.", chooseOne: "Wählen Sie eine der Optionen.", chooseMany: "Wählen Sie aus den Optionen.",
      rating: "Wählen Sie eine Bewertung von {min} bis {max}.", yesNo: "Wählen Sie Ja oder Nein.", matrixOne: "Wählen Sie in jeder Zeile eine Spalte.",
      matrixMany: "Wählen Sie in jeder Zeile aus den Spalten.", matrixMissing: "Beantworten Sie jede Zeile (fehlt: {rows}).", rank: "Ordnen Sie jeden Eintrag genau einmal ein.",
      pictureOne: "Wählen Sie eines der Bilder.", pictureMany: "Wählen Sie aus den Bildern.", fileOne: "Hängen Sie nur eine Datei an.", fileMax: "Hängen Sie höchstens {max} Dateien an.",
      fileType: "„{name}“ ist kein erlaubter Dateityp.", fileSize: "„{name}“ ist größer als {size}.", uploadFailed: "Hochladen fehlgeschlagen: {error}",
      readOnly: "Diese Antwort kann nicht geändert werden.", invalid: "Diese Antwort ist ungültig.", format: "Geben Sie einen Wert im erwarteten Format ein.",
      email: "Geben Sie eine gültige E-Mail-Adresse ein.", url: "Geben Sie eine gültige Webadresse ein (http oder https).", number: "Geben Sie eine Zahl ein.", date: "Geben Sie ein Datum ein.",
      numberRange: "Geben Sie eine Zahl {bounds} ein.", dateBetween: "Geben Sie ein Datum zwischen {min} und {max} ein.", dateMin: "Geben Sie ein Datum am oder nach dem {min} ein.",
      dateMax: "Geben Sie ein Datum am oder vor dem {max} ein.", length: "Geben Sie {bounds} Zeichen ein.", verbChoose: "Wählen Sie", verbAttach: "Hängen Sie", verbAnswer: "Beantworten Sie",
      count: "{verb} {bounds} {unit}.", unitOption: "Option", unitOptions: "Optionen", unitFile: "Datei an", unitFiles: "Dateien an", unitRow: "Zeile", unitRows: "Zeilen",
      boundsBetween: "zwischen {min} und {max}", boundsExactly: "genau {min}", boundsMin: "mindestens {min}", boundsMax: "höchstens {max}",
      slider: "Wählen Sie einen Wert von {min} bis {max}.", sliderStep: "Wählen Sie einen Wert von {min} bis {max} in Schritten von {step}.", tagsList: "Wählen Sie aus der Liste.",
      tagsOnce: "Jeder Eintrag kann nur einmal hinzugefügt werden.", tagsMax: "Fügen Sie höchstens {max} Einträge hinzu.", fieldRequired: "{label} ist erforderlich.",
      fieldNumber: "{label}: Geben Sie eine Zahl ein.", fieldEmail: "{label}: Geben Sie eine gültige E-Mail-Adresse ein.", repeatMin: "Fügen Sie mindestens {n} {unit} hinzu.",
      repeatMax: "Fügen Sie höchstens {n} {unit} hinzu.", unitItem: "Eintrag", unitItems: "Einträge", cellText: "{row}, {column}: Text erwartet.",
      cellNumber: "{row}, {column}: Geben Sie eine Zahl ein.", cellDropdown: "{row}, {column}: Wählen Sie eine der Optionen.", cellBoolean: "{row}, {column}: Wählen Sie Ja oder Nein.",
      cellRequired: "{row}: {column} ist erforderlich.",
    },
  },
  fr: {
    labels: {
      next: "Suivant", prev: "Retour", complete: "Envoyer", completed: "Merci ! Votre réponse a été enregistrée.", yes: "Oui", no: "Non",
      moveUp: "Monter", moveDown: "Descendre", keepOrder: "Garder cet ordre", rankingHint: "Faites glisser les éléments, ou utilisez les flèches, pour les classer.",
      removeFile: "Retirer", addItem: "Ajouter", removeItem: "Retirer", itemTitle: "Élément {n}", uploading: "Envoi en cours…", notSet: "Non défini",
      selected: "Sélection", clearSignature: "Effacer", signed: "Signé.", progress: "{n} sur {total}", progressLabel: "Progression",
      score: "Votre score : {score} sur {max}.", passed: "Réussi.", failed: "Pas réussi cette fois-ci.", correctAnswer: "Bonne réponse : {answer}", yourAnswer: "Votre réponse : {answer}", timeLeft: "Temps restant : {time}", scoreLater: "Votre score vous sera communiqué plus tard.",
      errorSummary: "Veuillez vérifier ces réponses :", typeToSign: "Saisissez votre nom complet pour signer",
      rankPosition: "{item} : position {n} sur {total}",
    },
    messages: {
      required: "Cette question est obligatoire.", chooseOne: "Choisissez l’une des options.", chooseMany: "Choisissez parmi les options.",
      rating: "Choisissez une note de {min} à {max}.", yesNo: "Choisissez oui ou non.", matrixOne: "Choisissez une colonne par ligne.",
      matrixMany: "Choisissez parmi les colonnes de chaque ligne.", matrixMissing: "Répondez à chaque ligne (manquant : {rows}).", rank: "Classez chaque élément une seule fois.",
      pictureOne: "Choisissez l’une des images.", pictureMany: "Choisissez parmi les images.", fileOne: "Joignez un seul fichier.", fileMax: "Joignez au plus {max} fichiers.",
      fileType: "« {name} » n’est pas un type de fichier accepté.", fileSize: "« {name} » dépasse {size}.", uploadFailed: "Échec de l’envoi : {error}",
      readOnly: "Cette réponse ne peut pas être modifiée.", invalid: "Cette réponse n’est pas valide.", format: "Saisissez une valeur au format attendu.",
      email: "Saisissez une adresse e-mail valide.", url: "Saisissez une adresse web valide (http ou https).", number: "Saisissez un nombre.", date: "Saisissez une date.",
      numberRange: "Saisissez un nombre {bounds}.", dateBetween: "Saisissez une date entre le {min} et le {max}.", dateMin: "Saisissez une date à partir du {min}.",
      dateMax: "Saisissez une date jusqu’au {max}.", length: "Saisissez {bounds} caractères.", verbChoose: "Choisissez", verbAttach: "Joignez", verbAnswer: "Répondez à",
      unitOption: "option", unitOptions: "options", unitFile: "fichier", unitFiles: "fichiers", unitRow: "ligne", unitRows: "lignes",
      boundsBetween: "entre {min} et {max}", boundsExactly: "exactement {min}", boundsMin: "au moins {min}", boundsMax: "au plus {max}",
      slider: "Choisissez une valeur de {min} à {max}.", sliderStep: "Choisissez une valeur de {min} à {max} par pas de {step}.", tagsList: "Choisissez dans la liste.",
      tagsOnce: "Chaque entrée ne peut être ajoutée qu’une fois.", tagsMax: "Ajoutez au plus {max} entrées.", fieldRequired: "{label} est obligatoire.",
      fieldNumber: "{label} : saisissez un nombre.", fieldEmail: "{label} : saisissez une adresse e-mail valide.", repeatMin: "Ajoutez au moins {n} {unit}.",
      repeatMax: "Ajoutez au plus {n} {unit}.", unitItem: "élément", unitItems: "éléments", cellText: "{row}, {column} : texte attendu.",
      cellNumber: "{row}, {column} : saisissez un nombre.", cellDropdown: "{row}, {column} : choisissez l’une des options.", cellBoolean: "{row}, {column} : choisissez oui ou non.",
      cellRequired: "{row} : {column} est obligatoire.",
    },
  },
  es: {
    labels: {
      next: "Siguiente", prev: "Atrás", complete: "Enviar", completed: "¡Gracias! Hemos registrado tu respuesta.", yes: "Sí", no: "No",
      moveUp: "Subir", moveDown: "Bajar", keepOrder: "Mantener este orden", rankingHint: "Arrastra los elementos, o usa las flechas, para ordenarlos.",
      removeFile: "Quitar", addItem: "Añadir", removeItem: "Quitar", itemTitle: "Elemento {n}", uploading: "Subiendo…", notSet: "Sin elegir",
      selected: "Seleccionados", clearSignature: "Borrar", signed: "Firmado.", progress: "{n} de {total}", progressLabel: "Progreso",
      score: "Tu puntuación: {score} de {max}.", passed: "Has aprobado.", failed: "Esta vez no has aprobado.", correctAnswer: "Respuesta correcta: {answer}", yourAnswer: "Tu respuesta: {answer}", timeLeft: "Tiempo restante: {time}", scoreLater: "Te comunicaremos tu puntuación más adelante.",
      errorSummary: "Revisa estas respuestas:", typeToSign: "Escribe tu nombre completo para firmar",
      rankPosition: "{item}: posición {n} de {total}",
    },
    messages: {
      required: "Esta pregunta es obligatoria.", chooseOne: "Elige una de las opciones.", chooseMany: "Elige entre las opciones.",
      rating: "Elige una puntuación de {min} a {max}.", yesNo: "Elige sí o no.", matrixOne: "Elige una columna en cada fila.",
      matrixMany: "Elige entre las columnas de cada fila.", matrixMissing: "Responde cada fila (faltan: {rows}).", rank: "Ordena cada elemento exactamente una vez.",
      pictureOne: "Elige una de las imágenes.", pictureMany: "Elige entre las imágenes.", fileOne: "Adjunta solo un archivo.", fileMax: "Adjunta como máximo {max} archivos.",
      fileType: "«{name}» no es un tipo de archivo aceptado.", fileSize: "«{name}» supera {size}.", uploadFailed: "No se pudo subir: {error}",
      readOnly: "Esta respuesta no se puede cambiar.", invalid: "Esta respuesta no es válida.", format: "Introduce un valor con el formato esperado.",
      email: "Introduce un correo electrónico válido.", url: "Introduce una dirección web válida (http o https).", number: "Introduce un número.", date: "Introduce una fecha.",
      numberRange: "Introduce un número {bounds}.", dateBetween: "Introduce una fecha entre {min} y {max}.", dateMin: "Introduce una fecha a partir del {min}.",
      dateMax: "Introduce una fecha hasta el {max}.", length: "Introduce {bounds} caracteres.", verbChoose: "Elige", verbAttach: "Adjunta", verbAnswer: "Responde",
      unitOption: "opción", unitOptions: "opciones", unitFile: "archivo", unitFiles: "archivos", unitRow: "fila", unitRows: "filas",
      boundsBetween: "entre {min} y {max}", boundsExactly: "exactamente {min}", boundsMin: "al menos {min}", boundsMax: "como máximo {max}",
      slider: "Elige un valor de {min} a {max}.", sliderStep: "Elige un valor de {min} a {max} en pasos de {step}.", tagsList: "Elige de la lista.",
      tagsOnce: "Cada entrada se puede añadir una sola vez.", tagsMax: "Añade como máximo {max} entradas.", fieldRequired: "{label} es obligatorio.",
      fieldNumber: "{label}: introduce un número.", fieldEmail: "{label}: introduce un correo electrónico válido.", repeatMin: "Añade al menos {n} {unit}.",
      repeatMax: "Añade como máximo {n} {unit}.", unitItem: "elemento", unitItems: "elementos", cellText: "{row}, {column}: se espera texto.",
      cellNumber: "{row}, {column}: introduce un número.", cellDropdown: "{row}, {column}: elige una de las opciones.", cellBoolean: "{row}, {column}: elige sí o no.",
      cellRequired: "{row}: {column} es obligatorio.",
    },
  },
  it: {
    labels: {
      next: "Avanti", prev: "Indietro", complete: "Invia", completed: "Grazie! La tua risposta è stata registrata.", yes: "Sì", no: "No",
      moveUp: "Sposta su", moveDown: "Sposta giù", keepOrder: "Mantieni questo ordine", rankingHint: "Trascina gli elementi, o usa le frecce, per ordinarli.",
      removeFile: "Rimuovi", addItem: "Aggiungi", removeItem: "Rimuovi", itemTitle: "Elemento {n}", uploading: "Caricamento…", notSet: "Non impostato",
      selected: "Selezionati", clearSignature: "Cancella", signed: "Firmato.", progress: "{n} di {total}", progressLabel: "Avanzamento",
      score: "Il tuo punteggio: {score} su {max}.", passed: "Superato.", failed: "Questa volta non hai superato il test.", correctAnswer: "Risposta corretta: {answer}", yourAnswer: "La tua risposta: {answer}", timeLeft: "Tempo rimasto: {time}", scoreLater: "Il punteggio ti sarà comunicato più tardi.",
      errorSummary: "Controlla queste risposte:", typeToSign: "Scrivi il tuo nome completo per firmare",
      rankPosition: "{item}: posizione {n} di {total}",
    },
    messages: {
      required: "Questa domanda è obbligatoria.", chooseOne: "Scegli una delle opzioni.", chooseMany: "Scegli tra le opzioni.",
      rating: "Scegli un voto da {min} a {max}.", yesNo: "Scegli sì o no.", matrixOne: "Scegli una colonna per ogni riga.",
      matrixMany: "Scegli tra le colonne di ogni riga.", matrixMissing: "Rispondi a ogni riga (mancano: {rows}).", rank: "Ordina ogni elemento una sola volta.",
      pictureOne: "Scegli una delle immagini.", pictureMany: "Scegli tra le immagini.", fileOne: "Allega un solo file.", fileMax: "Allega al massimo {max} file.",
      fileType: "«{name}» non è un tipo di file accettato.", fileSize: "«{name}» supera {size}.", uploadFailed: "Caricamento non riuscito: {error}",
      readOnly: "Questa risposta non può essere modificata.", invalid: "Questa risposta non è valida.", format: "Inserisci un valore nel formato previsto.",
      email: "Inserisci un indirizzo email valido.", url: "Inserisci un indirizzo web valido (http o https).", number: "Inserisci un numero.", date: "Inserisci una data.",
      numberRange: "Inserisci un numero {bounds}.", dateBetween: "Inserisci una data tra il {min} e il {max}.", dateMin: "Inserisci una data dal {min} in poi.",
      dateMax: "Inserisci una data fino al {max}.", length: "Inserisci {bounds} caratteri.", verbChoose: "Scegli", verbAttach: "Allega", verbAnswer: "Rispondi a",
      unitOption: "opzione", unitOptions: "opzioni", unitFile: "file", unitFiles: "file", unitRow: "riga", unitRows: "righe",
      boundsBetween: "tra {min} e {max}", boundsExactly: "esattamente {min}", boundsMin: "almeno {min}", boundsMax: "al massimo {max}",
      slider: "Scegli un valore da {min} a {max}.", sliderStep: "Scegli un valore da {min} a {max} a passi di {step}.", tagsList: "Scegli dall’elenco.",
      tagsOnce: "Ogni voce può essere aggiunta una sola volta.", tagsMax: "Aggiungi al massimo {max} voci.", fieldRequired: "{label} è obbligatorio.",
      fieldNumber: "{label}: inserisci un numero.", fieldEmail: "{label}: inserisci un indirizzo email valido.", repeatMin: "Aggiungi almeno {n} {unit}.",
      repeatMax: "Aggiungi al massimo {n} {unit}.", unitItem: "elemento", unitItems: "elementi", cellText: "{row}, {column}: serve del testo.",
      cellNumber: "{row}, {column}: inserisci un numero.", cellDropdown: "{row}, {column}: scegli una delle opzioni.", cellBoolean: "{row}, {column}: scegli sì o no.",
      cellRequired: "{row}: {column} è obbligatorio.",
    },
  },
  pt: {
    labels: {
      next: "Seguinte", prev: "Voltar", complete: "Enviar", completed: "Obrigado! A sua resposta foi registada.", yes: "Sim", no: "Não",
      moveUp: "Mover para cima", moveDown: "Mover para baixo", keepOrder: "Manter esta ordem", rankingHint: "Arraste os itens, ou use as setas, para os ordenar.",
      removeFile: "Remover", addItem: "Adicionar", removeItem: "Remover", itemTitle: "Item {n}", uploading: "A enviar…", notSet: "Não definido",
      selected: "Selecionados", clearSignature: "Limpar", signed: "Assinado.", progress: "{n} de {total}", progressLabel: "Progresso",
      score: "A sua pontuação: {score} de {max}.", passed: "Passou.", failed: "Desta vez não passou.", correctAnswer: "Resposta correta: {answer}", yourAnswer: "A sua resposta: {answer}", timeLeft: "Tempo restante: {time}", scoreLater: "A sua pontuação será partilhada mais tarde.",
      errorSummary: "Verifique estas respostas:", typeToSign: "Escreva o seu nome completo para assinar",
      rankPosition: "{item}: posição {n} de {total}",
    },
    messages: {
      required: "Esta pergunta é obrigatória.", chooseOne: "Escolha uma das opções.", chooseMany: "Escolha entre as opções.",
      rating: "Escolha uma classificação de {min} a {max}.", yesNo: "Escolha sim ou não.", matrixOne: "Escolha uma coluna em cada linha.",
      matrixMany: "Escolha entre as colunas de cada linha.", matrixMissing: "Responda a todas as linhas (em falta: {rows}).", rank: "Ordene cada item exatamente uma vez.",
      pictureOne: "Escolha uma das imagens.", pictureMany: "Escolha entre as imagens.", fileOne: "Anexe apenas um ficheiro.", fileMax: "Anexe no máximo {max} ficheiros.",
      fileType: "“{name}” não é um tipo de ficheiro aceite.", fileSize: "“{name}” é maior do que {size}.", uploadFailed: "O envio falhou: {error}",
      readOnly: "Esta resposta não pode ser alterada.", invalid: "Esta resposta não é válida.", format: "Introduza um valor no formato esperado.",
      email: "Introduza um endereço de email válido.", url: "Introduza um endereço web válido (http ou https).", number: "Introduza um número.", date: "Introduza uma data.",
      numberRange: "Introduza um número {bounds}.", dateBetween: "Introduza uma data entre {min} e {max}.", dateMin: "Introduza uma data a partir de {min}.",
      dateMax: "Introduza uma data até {max}.", length: "Introduza {bounds} caracteres.", verbChoose: "Escolha", verbAttach: "Anexe", verbAnswer: "Responda a",
      unitOption: "opção", unitOptions: "opções", unitFile: "ficheiro", unitFiles: "ficheiros", unitRow: "linha", unitRows: "linhas",
      boundsBetween: "entre {min} e {max}", boundsExactly: "exatamente {min}", boundsMin: "pelo menos {min}", boundsMax: "no máximo {max}",
      slider: "Escolha um valor de {min} a {max}.", sliderStep: "Escolha um valor de {min} a {max} em passos de {step}.", tagsList: "Escolha da lista.",
      tagsOnce: "Cada entrada só pode ser adicionada uma vez.", tagsMax: "Adicione no máximo {max} entradas.", fieldRequired: "{label} é obrigatório.",
      fieldNumber: "{label}: introduza um número.", fieldEmail: "{label}: introduza um endereço de email válido.", repeatMin: "Adicione pelo menos {n} {unit}.",
      repeatMax: "Adicione no máximo {n} {unit}.", unitItem: "item", unitItems: "itens", cellText: "{row}, {column}: é esperado texto.",
      cellNumber: "{row}, {column}: introduza um número.", cellDropdown: "{row}, {column}: escolha uma das opções.", cellBoolean: "{row}, {column}: escolha sim ou não.",
      cellRequired: "{row}: {column} é obrigatório.",
    },
  },
  nl: {
    labels: {
      next: "Volgende", prev: "Terug", complete: "Versturen", completed: "Bedankt! Je antwoord is opgeslagen.", yes: "Ja", no: "Nee",
      moveUp: "Omhoog", moveDown: "Omlaag", keepOrder: "Deze volgorde houden", rankingHint: "Sleep de items, of gebruik de pijlen, om ze te ordenen.",
      removeFile: "Verwijderen", addItem: "Toevoegen", removeItem: "Verwijderen", itemTitle: "Item {n}", uploading: "Bezig met uploaden…", notSet: "Niet ingesteld",
      selected: "Gekozen", clearSignature: "Wissen", signed: "Ondertekend.", progress: "{n} van {total}", progressLabel: "Voortgang",
      score: "Je score: {score} van {max}.", passed: "Geslaagd.", failed: "Deze keer niet geslaagd.", correctAnswer: "Juiste antwoord: {answer}", yourAnswer: "Jouw antwoord: {answer}", timeLeft: "Resterende tijd: {time}", scoreLater: "Je score wordt later met je gedeeld.",
      errorSummary: "Controleer deze antwoorden:", typeToSign: "Typ je volledige naam om te ondertekenen",
      rankPosition: "{item}: positie {n} van {total}",
    },
    messages: {
      required: "Deze vraag is verplicht.", chooseOne: "Kies een van de opties.", chooseMany: "Kies uit de opties.",
      rating: "Kies een score van {min} tot {max}.", yesNo: "Kies ja of nee.", matrixOne: "Kies in elke rij één kolom.",
      matrixMany: "Kies in elke rij uit de kolommen.", matrixMissing: "Beantwoord elke rij (ontbreekt: {rows}).", rank: "Rangschik elk item precies één keer.",
      pictureOne: "Kies een van de afbeeldingen.", pictureMany: "Kies uit de afbeeldingen.", fileOne: "Voeg maar één bestand toe.", fileMax: "Voeg hoogstens {max} bestanden toe.",
      fileType: "‘{name}’ is geen toegestaan bestandstype.", fileSize: "‘{name}’ is groter dan {size}.", uploadFailed: "Uploaden mislukt: {error}",
      readOnly: "Dit antwoord kan niet worden gewijzigd.", invalid: "Dit antwoord is niet geldig.", format: "Vul een waarde in de verwachte vorm in.",
      email: "Vul een geldig e-mailadres in.", url: "Vul een geldig webadres in (http of https).", number: "Vul een getal in.", date: "Vul een datum in.",
      numberRange: "Vul een getal {bounds} in.", dateBetween: "Vul een datum tussen {min} en {max} in.", dateMin: "Vul een datum op of na {min} in.",
      dateMax: "Vul een datum op of voor {max} in.", length: "Vul {bounds} tekens in.", verbChoose: "Kies", verbAttach: "Voeg", verbAnswer: "Beantwoord",
      unitOption: "optie", unitOptions: "opties", unitFile: "bestand toe", unitFiles: "bestanden toe", unitRow: "rij", unitRows: "rijen",
      boundsBetween: "tussen {min} en {max}", boundsExactly: "precies {min}", boundsMin: "minstens {min}", boundsMax: "hoogstens {max}",
      slider: "Kies een waarde van {min} tot {max}.", sliderStep: "Kies een waarde van {min} tot {max} in stappen van {step}.", tagsList: "Kies uit de lijst.",
      tagsOnce: "Elk item kan maar één keer worden toegevoegd.", tagsMax: "Voeg hoogstens {max} items toe.", fieldRequired: "{label} is verplicht.",
      fieldNumber: "{label}: vul een getal in.", fieldEmail: "{label}: vul een geldig e-mailadres in.", repeatMin: "Voeg minstens {n} {unit} toe.",
      repeatMax: "Voeg hoogstens {n} {unit} toe.", unitItem: "item", unitItems: "items", cellText: "{row}, {column}: tekst verwacht.",
      cellNumber: "{row}, {column}: vul een getal in.", cellDropdown: "{row}, {column}: kies een van de opties.", cellBoolean: "{row}, {column}: kies ja of nee.",
      cellRequired: "{row}: {column} is verplicht.",
    },
  },
  pl: {
    labels: {
      next: "Dalej", prev: "Wstecz", complete: "Wyślij", completed: "Dziękujemy! Twoja odpowiedź została zapisana.", yes: "Tak", no: "Nie",
      moveUp: "W górę", moveDown: "W dół", keepOrder: "Zachowaj tę kolejność", rankingHint: "Przeciągnij elementy lub użyj strzałek, aby je uporządkować.",
      removeFile: "Usuń", addItem: "Dodaj", removeItem: "Usuń", itemTitle: "Element {n}", uploading: "Wysyłanie…", notSet: "Nie ustawiono",
      selected: "Wybrane", clearSignature: "Wyczyść", signed: "Podpisano.", progress: "{n} z {total}", progressLabel: "Postęp",
      score: "Twój wynik: {score} z {max}.", passed: "Zaliczono.", failed: "Tym razem bez zaliczenia.", correctAnswer: "Poprawna odpowiedź: {answer}", yourAnswer: "Twoja odpowiedź: {answer}", timeLeft: "Pozostały czas: {time}", scoreLater: "Wynik zostanie przekazany później.",
      errorSummary: "Sprawdź te odpowiedzi:", typeToSign: "Wpisz imię i nazwisko, aby podpisać",
      rankPosition: "{item}: pozycja {n} z {total}",
    },
    messages: {
      required: "To pytanie jest wymagane.", chooseOne: "Wybierz jedną z opcji.", chooseMany: "Wybierz spośród opcji.",
      rating: "Wybierz ocenę od {min} do {max}.", yesNo: "Wybierz tak lub nie.", matrixOne: "Wybierz jedną kolumnę w każdym wierszu.",
      matrixMany: "Wybierz spośród kolumn w każdym wierszu.", matrixMissing: "Odpowiedz w każdym wierszu (brakuje: {rows}).", rank: "Uszereguj każdy element dokładnie raz.",
      pictureOne: "Wybierz jeden z obrazów.", pictureMany: "Wybierz spośród obrazów.", fileOne: "Dołącz tylko jeden plik.", fileMax: "Dołącz najwyżej {max} plików.",
      fileType: "„{name}” to niedozwolony typ pliku.", fileSize: "„{name}” jest większy niż {size}.", uploadFailed: "Wysyłanie nie powiodło się: {error}",
      readOnly: "Tej odpowiedzi nie można zmienić.", invalid: "Ta odpowiedź jest nieprawidłowa.", format: "Wpisz wartość w oczekiwanym formacie.",
      email: "Wpisz prawidłowy adres e-mail.", url: "Wpisz prawidłowy adres strony (http lub https).", number: "Wpisz liczbę.", date: "Wpisz datę.",
      numberRange: "Wpisz liczbę {bounds}.", dateBetween: "Wpisz datę od {min} do {max}.", dateMin: "Wpisz datę {min} lub późniejszą.",
      dateMax: "Wpisz datę {max} lub wcześniejszą.", length: "Wpisz {bounds} znaków.", verbChoose: "Wybierz", verbAttach: "Dołącz", verbAnswer: "Odpowiedz w",
      unitOption: "opcję", unitOptions: "opcji", unitFile: "plik", unitFiles: "plików", unitRow: "wierszu", unitRows: "wierszach",
      boundsBetween: "od {min} do {max}", boundsExactly: "dokładnie {min}", boundsMin: "co najmniej {min}", boundsMax: "najwyżej {max}",
      slider: "Wybierz wartość od {min} do {max}.", sliderStep: "Wybierz wartość od {min} do {max} co {step}.", tagsList: "Wybierz z listy.",
      tagsOnce: "Każdy wpis można dodać tylko raz.", tagsMax: "Dodaj najwyżej {max} wpisów.", fieldRequired: "Pole {label} jest wymagane.",
      fieldNumber: "{label}: wpisz liczbę.", fieldEmail: "{label}: wpisz prawidłowy adres e-mail.", repeatMin: "Dodaj co najmniej {n} {unit}.",
      repeatMax: "Dodaj najwyżej {n} {unit}.", unitItem: "element", unitItems: "elementów", cellText: "{row}, {column}: wymagany tekst.",
      cellNumber: "{row}, {column}: wpisz liczbę.", cellDropdown: "{row}, {column}: wybierz jedną z opcji.", cellBoolean: "{row}, {column}: wybierz tak lub nie.",
      cellRequired: "{row}: pole {column} jest wymagane.",
    },
  },
  ru: {
    labels: {
      next: "Далее", prev: "Назад", complete: "Отправить", completed: "Спасибо! Ваш ответ сохранён.", yes: "Да", no: "Нет",
      moveUp: "Вверх", moveDown: "Вниз", keepOrder: "Оставить этот порядок", rankingHint: "Перетащите элементы или используйте стрелки, чтобы упорядочить их.",
      removeFile: "Удалить", addItem: "Добавить", removeItem: "Удалить", itemTitle: "Элемент {n}", uploading: "Загрузка…", notSet: "Не выбрано",
      selected: "Выбрано", clearSignature: "Очистить", signed: "Подписано.", progress: "{n} из {total}", progressLabel: "Прогресс",
      score: "Ваш результат: {score} из {max}.", passed: "Вы сдали.", failed: "В этот раз не сдано.", correctAnswer: "Правильный ответ: {answer}", yourAnswer: "Ваш ответ: {answer}", timeLeft: "Осталось времени: {time}", scoreLater: "Результат сообщим позже.",
      errorSummary: "Проверьте эти ответы:", typeToSign: "Введите полное имя, чтобы подписать",
      rankPosition: "{item}: позиция {n} из {total}",
    },
    messages: {
      required: "Это обязательный вопрос.", chooseOne: "Выберите один из вариантов.", chooseMany: "Выберите из вариантов.",
      rating: "Выберите оценку от {min} до {max}.", yesNo: "Выберите да или нет.", matrixOne: "Выберите один столбец в каждой строке.",
      matrixMany: "Выберите из столбцов в каждой строке.", matrixMissing: "Ответьте в каждой строке (не хватает: {rows}).", rank: "Расставьте каждый элемент ровно один раз.",
      pictureOne: "Выберите одно из изображений.", pictureMany: "Выберите из изображений.", fileOne: "Прикрепите только один файл.", fileMax: "Прикрепите не более {max} файлов.",
      fileType: "«{name}» — недопустимый тип файла.", fileSize: "«{name}» больше {size}.", uploadFailed: "Не удалось загрузить: {error}",
      readOnly: "Этот ответ нельзя изменить.", invalid: "Этот ответ недопустим.", format: "Введите значение в нужном формате.",
      email: "Введите правильный адрес электронной почты.", url: "Введите правильный веб-адрес (http или https).", number: "Введите число.", date: "Введите дату.",
      numberRange: "Введите число {bounds}.", dateBetween: "Введите дату от {min} до {max}.", dateMin: "Введите дату не раньше {min}.",
      dateMax: "Введите дату не позже {max}.", length: "Введите {bounds} символов.", verbChoose: "Выберите", verbAttach: "Прикрепите", verbAnswer: "Ответьте в",
      unitOption: "вариант", unitOptions: "вариантов", unitFile: "файл", unitFiles: "файлов", unitRow: "строке", unitRows: "строках",
      boundsBetween: "от {min} до {max}", boundsExactly: "ровно {min}", boundsMin: "не менее {min}", boundsMax: "не более {max}",
      slider: "Выберите значение от {min} до {max}.", sliderStep: "Выберите значение от {min} до {max} с шагом {step}.", tagsList: "Выберите из списка.",
      tagsOnce: "Каждую запись можно добавить только один раз.", tagsMax: "Добавьте не более {max} записей.", fieldRequired: "Поле «{label}» обязательно.",
      fieldNumber: "{label}: введите число.", fieldEmail: "{label}: введите правильный адрес электронной почты.", repeatMin: "Добавьте не менее {n} {unit}.",
      repeatMax: "Добавьте не более {n} {unit}.", unitItem: "элемент", unitItems: "элементов", cellText: "{row}, {column}: нужен текст.",
      cellNumber: "{row}, {column}: введите число.", cellDropdown: "{row}, {column}: выберите один из вариантов.", cellBoolean: "{row}, {column}: выберите да или нет.",
      cellRequired: "{row}: поле «{column}» обязательно.",
    },
  },
  zh: {
    labels: {
      next: "下一步", prev: "上一步", complete: "提交", completed: "谢谢！您的回答已记录。", yes: "是", no: "否",
      moveUp: "上移", moveDown: "下移", keepOrder: "保持此顺序", rankingHint: "拖动项目或使用箭头按钮进行排序。",
      removeFile: "删除", addItem: "添加", removeItem: "删除", itemTitle: "第 {n} 项", uploading: "正在上传…", notSet: "未设置",
      selected: "已选", clearSignature: "清除", signed: "已签名。", progress: "{n} / {total}", progressLabel: "进度",
      score: "您的得分：{score} / {max}。", passed: "您已通过。", failed: "这次未通过。", correctAnswer: "正确答案：{answer}", yourAnswer: "您的答案：{answer}", timeLeft: "剩余时间：{time}", scoreLater: "您的成绩稍后公布。",
      errorSummary: "请检查以下回答：", typeToSign: "输入您的全名以签名",
      rankPosition: "{item}：第 {n} 位，共 {total} 位",
    },
    messages: {
      required: "此题为必答题。", chooseOne: "请选择一个选项。", chooseMany: "请从选项中选择。",
      rating: "请选择 {min} 到 {max} 的评分。", yesNo: "请选择是或否。", matrixOne: "请在每一行选择一列。",
      matrixMany: "请在每一行从各列中选择。", matrixMissing: "请回答每一行（缺少：{rows}）。", rank: "每个项目必须且只能排序一次。",
      pictureOne: "请选择一张图片。", pictureMany: "请从图片中选择。", fileOne: "只能附加一个文件。", fileMax: "最多附加 {max} 个文件。",
      fileType: "“{name}”不是允许的文件类型。", fileSize: "“{name}”超过 {size}。", uploadFailed: "上传失败：{error}",
      readOnly: "此答案不能更改。", invalid: "此答案无效。", format: "请按要求的格式输入。",
      email: "请输入有效的电子邮件地址。", url: "请输入有效的网址（http 或 https）。", number: "请输入数字。", date: "请输入日期。",
      numberRange: "请输入{bounds}的数字。", dateBetween: "请输入 {min} 到 {max} 之间的日期。", dateMin: "请输入 {min} 或之后的日期。",
      dateMax: "请输入 {max} 或之前的日期。", length: "请输入{bounds}个字符。", count: "请{verb}{bounds}{unit}。",
      verbChoose: "选择", verbAttach: "附加", verbAnswer: "回答", unitOption: "个选项", unitOptions: "个选项", unitFile: "个文件", unitFiles: "个文件", unitRow: "行", unitRows: "行",
      boundsBetween: " {min} 到 {max} ", boundsExactly: "正好 {min} ", boundsMin: "至少 {min} ", boundsMax: "最多 {max} ",
      slider: "请选择 {min} 到 {max} 之间的值。", sliderStep: "请选择 {min} 到 {max} 之间、步长为 {step} 的值。", tagsList: "请从列表中选择。",
      tagsOnce: "每个条目只能添加一次。", tagsMax: "最多添加 {max} 个条目。", fieldRequired: "{label}为必填项。",
      fieldNumber: "{label}：请输入数字。", fieldEmail: "{label}：请输入有效的电子邮件地址。", repeatMin: "请至少添加 {n} {unit}。",
      repeatMax: "最多添加 {n} {unit}。", unitItem: "项", unitItems: "项", cellText: "{row}，{column}：需要文本。",
      cellNumber: "{row}，{column}：请输入数字。", cellDropdown: "{row}，{column}：请选择一个选项。", cellBoolean: "{row}，{column}：请选择是或否。",
      cellRequired: "{row}：{column}为必填项。",
    },
  },
  ja: {
    labels: {
      next: "次へ", prev: "戻る", complete: "送信", completed: "ありがとうございました。回答を記録しました。", yes: "はい", no: "いいえ",
      moveUp: "上へ", moveDown: "下へ", keepOrder: "この順番のままにする", rankingHint: "項目をドラッグするか、矢印ボタンで並べ替えてください。",
      removeFile: "削除", addItem: "追加", removeItem: "削除", itemTitle: "項目 {n}", uploading: "アップロード中…", notSet: "未設定",
      selected: "選択済み", clearSignature: "消去", signed: "署名しました。", progress: "{n} / {total}", progressLabel: "進捗",
      score: "あなたのスコア：{score} / {max}", passed: "合格です。", failed: "今回は不合格です。", correctAnswer: "正解：{answer}", yourAnswer: "あなたの回答：{answer}", timeLeft: "残り時間：{time}", scoreLater: "スコアは後でお知らせします。",
      errorSummary: "次の回答を確認してください：", typeToSign: "署名するには氏名を入力してください",
      rankPosition: "{item}：{total} 件中 {n} 位",
    },
    messages: {
      required: "この質問は必須です。", chooseOne: "選択肢から 1 つ選んでください。", chooseMany: "選択肢から選んでください。",
      rating: "{min} から {max} の評価を選んでください。", yesNo: "はいかいいえを選んでください。", matrixOne: "各行で 1 つの列を選んでください。",
      matrixMany: "各行で列から選んでください。", matrixMissing: "すべての行に回答してください（未回答：{rows}）。", rank: "各項目を 1 回ずつ順位付けしてください。",
      pictureOne: "画像を 1 つ選んでください。", pictureMany: "画像から選んでください。", fileOne: "添付できるファイルは 1 つだけです。", fileMax: "添付できるファイルは最大 {max} 個です。",
      fileType: "「{name}」は使用できないファイル形式です。", fileSize: "「{name}」は {size} を超えています。", uploadFailed: "アップロードに失敗しました：{error}",
      readOnly: "この回答は変更できません。", invalid: "この回答は無効です。", format: "正しい形式で入力してください。",
      email: "有効なメールアドレスを入力してください。", url: "有効なウェブアドレス（http または https）を入力してください。", number: "数値を入力してください。", date: "日付を入力してください。",
      numberRange: "{bounds}の数値を入力してください。", dateBetween: "{min} から {max} までの日付を入力してください。", dateMin: "{min} 以降の日付を入力してください。",
      dateMax: "{max} 以前の日付を入力してください。", length: "{bounds}文字で入力してください。", count: "{bounds}{unit}{verb}ください。",
      verbChoose: "選んで", verbAttach: "添付して", verbAnswer: "回答して", unitOption: "つ", unitOptions: "つ", unitFile: "個のファイルを", unitFiles: "個のファイルを", unitRow: "行に", unitRows: "行に",
      boundsBetween: "{min}〜{max} ", boundsExactly: "ちょうど {min} ", boundsMin: "{min} 以上", boundsMax: "{max} 以下",
      slider: "{min} から {max} の値を選んでください。", sliderStep: "{min} から {max} の値を {step} 刻みで選んでください。", tagsList: "リストから選んでください。",
      tagsOnce: "同じ項目は 1 回しか追加できません。", tagsMax: "追加できるのは最大 {max} 個です。", fieldRequired: "{label}は必須です。",
      fieldNumber: "{label}：数値を入力してください。", fieldEmail: "{label}：有効なメールアドレスを入力してください。", repeatMin: "{n} {unit}以上追加してください。",
      repeatMax: "追加できるのは最大 {n} {unit}です。", unitItem: "件", unitItems: "件", cellText: "{row}、{column}：テキストを入力してください。",
      cellNumber: "{row}、{column}：数値を入力してください。", cellDropdown: "{row}、{column}：選択肢から 1 つ選んでください。", cellBoolean: "{row}、{column}：はいかいいえを選んでください。",
      cellRequired: "{row}：{column}は必須です。",
    },
  },
};

/** The locales with a built-in pack. */
export const BUILTIN_LOCALES: readonly string[] = Object.keys(packs);

/** Add or extend the texts of a locale. Later calls override earlier ones, key by key. */
export function addLocalePack(locale: string, pack: LocalePack): void {
  const current = packs[locale] ?? {};
  packs[locale] = {
    labels: { ...current.labels, ...pack.labels },
    messages: { ...current.messages, ...pack.messages },
  };
}

/** Locales to try, most specific first: `pt-BR`, `pt`, then English. */
function chain(locale: string | undefined): string[] {
  const out: string[] = [];
  if (locale) {
    out.push(locale);
    const lang = locale.split("-")[0]!;
    if (lang !== locale) out.push(lang);
  }
  out.push("en");
  return out;
}

/** The runner's texts for a locale, falling back key by key. */
export function labelsFor(locale?: string): Labels {
  const out = { ...ENGLISH_LABELS };
  for (const l of chain(locale).reverse()) Object.assign(out, packs[l]?.labels);
  return out;
}

const fill = (template: string, params: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));

/** A validation message in a locale, with its `{name}` placeholders filled in. */
export function message(locale: string | undefined, key: MessageKey, params: Record<string, string | number> = {}): string {
  for (const l of chain(locale)) {
    const t = packs[l]?.messages?.[key];
    if (t) return fill(t, params);
  }
  return fill(ENGLISH_MESSAGES[key], params);
}

/** "between 2 and 5", "at least 2", … in a locale. */
export function bounds(locale: string | undefined, min: number | string | undefined, max: number | string | undefined): string {
  if (min !== undefined && max !== undefined) {
    return min === max ? message(locale, "boundsExactly", { min }) : message(locale, "boundsBetween", { min, max });
  }
  if (min !== undefined) return message(locale, "boundsMin", { min });
  return message(locale, "boundsMax", { max: max! });
}

/**
 * Pick the locale to show a survey in: an opt-in `?lang=` URL parameter
 * first, then the browser's languages, then the survey's default. Only
 * locales the survey lists (in `locales`) are picked.
 */
export function detectLocale(
  survey: { defaultLocale?: string; locales?: string[] },
  { url, param = "lang", languages }: { url?: string | URL; param?: string; languages?: readonly string[] } = {},
): string {
  const fallback = survey.defaultLocale ?? "en";
  const offered = new Set([fallback, ...(survey.locales ?? [])]);
  const match = (tag: string | null | undefined) => {
    if (!tag) return undefined;
    if (offered.has(tag)) return tag;
    const lang = tag.split("-")[0]!;
    return offered.has(lang) ? lang : undefined;
  };
  if (url !== undefined) {
    const fromUrl = match(new URL(String(url), "http://x").searchParams.get(param));
    if (fromUrl) return fromUrl;
  }
  const browser = languages ?? (typeof navigator !== "undefined" ? navigator.languages : []);
  for (const tag of browser ?? []) {
    const m = match(tag);
    if (m) return m;
  }
  return fallback;
}
