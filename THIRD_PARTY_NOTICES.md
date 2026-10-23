# Third-party notices

SiteBoard bundles the following open-source software in `vendor/`. Each remains under its own licence.

| Component | Version | Licence | Use | Copyright / source |
|---|---|---|---|---|
| pdf.js | 4.10.38 | Apache-2.0 | Reads the SDR PDFs and their photos | Mozilla Foundation, https://github.com/mozilla/pdf.js |
| jsPDF | 2.5.1 | MIT | Builds report and memo PDFs | James Hall, yWorks GmbH and contributors, https://github.com/parallax/jsPDF |
| jsPDF-AutoTable | 3.8.2 | MIT | Tables in PDFs | Simon Bengtsson, https://github.com/simonbengtsson/jsPDF-AutoTable |
| docx | 8.5.0 | MIT | Builds Word reports | Dolan Miu and contributors, https://github.com/dolanmiu/docx |
| SheetJS Community Edition (xlsx) | 0.18.5 | Apache-2.0 | Excel export | SheetJS LLC, https://sheetjs.com |
| qrcode-generator | – | MIT | QR codes in Settings | Kazuhiko Arase, https://github.com/kazuhikoarase/qrcode-generator |
| Barlow, Barlow Condensed, IBM Plex Mono | – | SIL Open Font License 1.1 | Fonts, loaded from Google Fonts (not bundled) | Jeremy Tribby; IBM Corp., https://fonts.google.com |

The pdf.js Apache-2.0 notice is kept at the top of `vendor/pdf.min.mjs` and `vendor/pdf.worker.min.mjs`. The Apache-2.0 licence text: https://www.apache.org/licenses/LICENSE-2.0 . The OFL text: https://openfontlicense.org .

The SiteBoard source code is MIT-licensed, see `LICENSE`.

## jsPDF – MIT licence text

```
Copyright
(c) 2010-2021 James Hall, https://github.com/MrRio/jsPDF
(c) 2015-2021 yWorks GmbH, https://www.yworks.com/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## jsPDF-AutoTable – MIT licence text

```
The MIT License (MIT)

Copyright (c) 2014 Simon Bengtsson, https://github.com/simonbengtsson/jspdf-autotable

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## docx – MIT licence text

```
The MIT License (MIT)

Copyright (c) 2016 Dolan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```



## Leaflet 1.9.4 (vendor/leaflet)
BSD 2-Clause License. Copyright (c) 2010-2023, Volodymyr Agafonkin; (c) 2010-2011, CloudMade. See vendor/leaflet/LICENSE.

## Map data and tiles (loaded at run time, not included)
Basemap tiles are requested from OpenStreetMap (c) OpenStreetMap contributors, ODbL, and Esri World Imagery (Imagery (c) Esri, Maxar, Earthstar Geographics). Their terms of use apply. The project KMZ is loaded by the user and is never uploaded.
