Create an app that has clean interface for paper reading, write notes and realtime summarization and inplace translation.

The GUI design:
* After launch the app, there should be a welcome window asking for select paper with options: url, paper title (search online), drag and drop pdf. For url way, the pdf should be downloaded to local. For paper title, the title should be search online use an embedded browser, find the pdf for downloading. For pdf, user should be able to drag & drop the pdf directly to the window.

* After selected a way to get the paper, the main window will be opened. On top are the necessary options: Open new paper, save the current paper, undo, etc. Below is the main window with two big col. On the left side is the original paper pdf, on the right side is the translated version of the paper. The user can click on any part of the text on the right, the original text on the left will be highlighted. The left and right should be roughly synchronized in spatial order to let the user be able to compare. Then, user should be given the option to select a paragraph of the original text and click auto-summarize. Also an option to find inspirations based on the selected text. All these functions is backed by llm backends.
* Multiple llm backends should be supported: e.g. openrouter, ollama, openai, claude,etc. It should provide options in the welcome session to choice.
* There should also be a hiddeable colum for user to make notes. The notes will have both text and image taken from screen shot (screen shot should be a embeded function with cropping function).
* The save button should be able to save all notes to local.

Technical Details:
* The final code should be installable. Optional could be a debian or app
* When extract the text and images for translation (llm based), better use pdf extraction tool to extract.
* The note should provide text color, dick, highlight, etc.
* The functions like summarization and other LLM based function should provide button for regenerate.
