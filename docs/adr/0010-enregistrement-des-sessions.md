---
title: "ADR 0010 — Enregistrement permanent des sessions, analysé par un modèle de langage"
status: accepted
date: 2026-10-09
nature: structurant
---

# ADR 0010 — Enregistrement des sessions et pondération de l'affichage

## Contexte
La Chronique ne contenait que ce que la table prenait le temps de noter. Les tables veulent une trace complète de chaque soirée :
ce qui s'est dit, et les événements qui en découlent, sans que le MJ ait à tout saisir. Une session enregistrée produit des dizaines
d'événements de plus : les vues de l'Explorer doivent rester lisibles avec des centaines de points.

## Décision
- **Capture dans le navigateur** de l'appareil du MJ : reconnaissance vocale du navigateur (Web Speech API, Chrome/Edge), relancée
  d'elle-même après chaque silence, et archive audio facultative (MediaRecorder). L'enregistreur est monté au-dessus de toutes les pages
  (`RecorderProvider`) : naviguer ne l'interrompt pas ; après un rechargement, l'appareil qui tient l'enregistrement reprend seul.
- **Un appareil à la fois** par session (`deviceId`) ; un autre appareil du MJ peut reprendre la main explicitement, ou d'office si le
  premier est muet depuis 90 s. La fin de session arrête l'enregistrement côté serveur (`CampaignsService.onSessionEnded`).
- **Transcription append-only** (`transcript_segments`) : numérotation par l'appareil (idempotence d'un renvoi), séquence serveur sous
  verrou de ligne, file d'envoi sauvegardée localement. L'heure d'une phrase est déduite de son ancienneté à l'envoi (`ageMs`), insensible
  au décalage des horloges.
- **Analyse au fil de l'eau** (`SessionAnalyzer`, implémentation Claude par le SDK officiel) : une fenêtre part dès ~350 mots en attente
  ou 4 minutes, à chaque pause/arrêt, ou à la demande du MJ. Le modèle reçoit le contexte de la campagne (personnages, entités de la
  Constellation avec leurs identifiants, événements récents de la session, fin de la transcription déjà analysée) et répond en sortie
  structurée. Le service valide tout : types hors catalogue → note, identifiants inconnus → noms libres, segments bornés à la fenêtre,
  confiance < 0,2 écartée. Les événements entrent dans la Chronique (`source: system`, `payload.origin = 'recording'`, `segments`,
  `confidence`, clé d'idempotence par fenêtre) et sont reliés aux événements dont ils sont la suite.
- **Traçabilité** : chaque analyse est journalisée (`recording_analyses` : fenêtre, modèle, jetons, événements créés, erreur). Une fenêtre
  en échec est retentée (après 2 minutes en automatique) puis abandonnée au troisième échec, sans bloquer la suite.
- **Relecture par le MJ** : réglage « relire avant de révéler » (événements créés `gm_only`) ; « révéler » ajoute une copie visible
  (avec ses liens) et retire l'original — le journal reste append-only (ADR 0003). « Retirer » est une correction ordinaire.
- **Confidentialité** : toute la table voit l'indicateur REC ; la transcription est réservée au MJ (réglage pour l'ouvrir aux joueurs) ;
  l'audio est servi au MJ seulement, par une route authentifiée (pas par `/uploads`), une partie par flux capté.
- **Poids d'affichage** (`eventWeight`, `packages/shared`) : importance d'abord, puis liens, personnages impliqués, saisie manuelle
  (+), confiance de l'analyse (×). **Niveau de détail** (`selectByWeight`) : un budget de points avec un minimum par groupe (session,
  nature d'événement) pour qu'une soirée bavarde n'écrase pas les autres. Utilisé par la Chronique 3D (tranches proportionnées,
  spirale d'or, lourds près de l'axe, étiquettes sans chevauchement), la Constellation, la Frise (suites de détails déduits repliées)
  et la nouvelle vue **Sessions** (frise par nature d'événement, densité de parole, journal entrelacé parole/événements).

## Conséquences
- Sans clé `ANTHROPIC_API_KEY`, l'enregistrement fonctionne (transcription conservée) mais rien n'est déduit ; l'interface le dit.
  Modèle par défaut : `claude-opus-5-5` (`RECORDING_MODEL`), seuil réglable (`RECORDING_MIN_WORDS`).
- La qualité dépend de la reconnaissance vocale du navigateur (pas de distinction des voix, noms propres approximatifs — l'analyse les
  rapproche des entités connues). Le port `SessionAnalyzer` et le champ `speaker` laissent la place à une transcription serveur.
- L'archive audio vit dans `DATA_DIR/recordings` ; elle n'est pas supprimée avec la campagne (nettoyage à prévoir).
