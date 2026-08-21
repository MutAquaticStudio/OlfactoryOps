# React Bits Motion System

OlfactoryOps uses a small, audited source layer under `src/ui/motion/`. It does not add a React Bits package, initialize shadcn, or use a React Bits Pro registry.

The layer follows the function boundaries documented by React Bits for `AnimatedContent`, `ScrollReveal`, `AnimatedList`, `Stepper`, and `CountUp`, but is implemented locally with the existing `framer-motion` dependency so the application keeps ownership of its runtime, styling, and accessibility policy.

## Policy

- Motion is optional and never contains required information.
- Enter and list transitions use 160-220ms timing only.
- The OS `prefers-reduced-motion` signal and the signed-in user's `reduceMotion` preference both disable optional motion.
- No autoplay, cursor effect, glow, glass treatment, WebGL, shader, parallax, or text scrambling is allowed in the authenticated workspace.
- `Stepper` communicates progress semantically; its visual state is a secondary signal.

## Source audit

- React Bits public component index: <https://reactbits.dev/get-started/index>
- React Bits source repository: <https://github.com/DavidHDev/react-bits>
- The repository identifies its public source license as MIT plus Commons Clause. No Pro block, registry configuration, or source requiring a separate Pro license is included here.

All motion styling is isolated to `src/ui/motion/motion.css`; the Quiet Lab token, shell, component, and feature styles remain the only global application styling layers.
