# Phase 2 Lab Weighing

Creating a Lab Weighing session only records plan lines. Confirmation locks the
session, lines, lot, and optional reservation; it validates tolerance, material
match, quality, expiry, and stock before creating immutable `CONSUMPTION`
movement evidence.

Corrections never delete history. They create a compensating movement linked to
the original one, and are rejected if the correction would make on-hand stock
or active reservations invalid.
