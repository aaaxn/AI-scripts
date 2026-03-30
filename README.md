AI-Scripts (OpenRouter-only fork)
=================================

Stripped-down fork of [VictorTaelin/AI-scripts](https://github.com/VictorTaelin/AI-scripts), reduced to only `csh` (terminal chat with shell execution) using free OpenRouter models.

Models
------

| Alias | Model |
|-------|-------|
| `s` (default) | `stepfun/step-3.5-flash:free` |
| `n` | `nvidia/nemotron-3-super-120b-a12b:free` |

What was removed
----------------

- Vendors: Anthropic, Google, xAI (only OpenRouter via OpenAI-compatible API remains)
- Tools: holefill, shot, refactor, board, long (only `csh` remains)
- Dependencies: stripped from 15 to 3

Usage
-----

```bash
npm install -g .
```

Store your OpenRouter API key:

```bash
echo -n 'your-key-here' > ~/.config/openrouter.token
```

Then:

```bash
csh        # chat with stepfun flash (default)
csh s      # same, explicit
csh n      # chat with nvidia nemotron
```

License
-------

MIT
