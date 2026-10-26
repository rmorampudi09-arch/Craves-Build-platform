# App sounds

Made in code with [earshot](https://github.com/Leonxlnx/earshot) (MIT, commit 591fa3e) from its sound bank; no
recordings ship here. Rendered with `earshot sfx render <id> --sr 44100 --peak <dB> [--pitch <note>]`, written as
16-bit WAV, and checked clean with `earshot sfx check`. Long sounds are cut to 1.6 s with a 200 ms fade.

| file | earshot id | pitch | peak dBFS | plays when |
|---|---|---|---|---|
| add-to-cart.wav | fit/pop/mouth_plop | G5 | -9 | the server confirms a dish was added to the cart |
| order-placed.wav | logo_sting/soft_bloom | B5 | -5 | payment succeeds and the order is placed |
| order-update.wav | notify/m2 | G5 | -5 | a tracked order moves to a new status |
| new-notice.wav | mallet/celesta | D6 | -7 | the customer's unread notification count goes up |
| chef-new-order.wav | fit/bell/small_bell | (own) | -1 | a chef order arrives that the app has not seen; rung twice 0.6 s apart, 1.8 s |
| chef-order-done.wav | mallet/marimba | G4 | -8 | the chef's Accept or Ready is saved |

`fit/pop/mouth_plop` and `fit/bell/small_bell` are earshot fits of CC0 Freesound recordings (CapsLok fs-181907,
steffcaffrey fs-452379); no attribution is required.
