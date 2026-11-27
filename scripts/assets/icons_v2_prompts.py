# 图标 v2 的 3×3 整表 prompt（Seedream 5.5）。用法见 docs/DEV_GUIDE.md §6.2：
# python3 -c "import icons_v2_prompts as p; ..." 拼成 'A 3x3 grid of nine separate game UI icons. Reading order ...: 1) ...; 2) .... ' + STYLE
STYLE = ("consistent style across all nine icons: minimalist luxury emblem icons for a dark, elegant modern Chinese urban mobile game; "
 "each object rendered as a refined small sculpture of matte brushed champagne-gold metal (soft pale gold, low saturation, NOT bright yellow, NOT glossy) "
 "with smoky black obsidian glass inlays and fine engraved hairline details; restrained soft rim light, gentle shadows, quiet and premium, "
 "Art Deco geometry, clean readable silhouette, generous negative space inside each icon; "
 "only tiny accents of color where specified; no cartoon shine, no candy gloss, no bright saturated colors; "
 "nine icons arranged in a 3x3 grid, each object fully separated with large empty spacing between them, centered in its cell, same scale, "
 "plain pure white background, no text, no letters, no numbers, no labels, no frames, no grid lines, no drop shadow boxes")
SHEETS = {
 'sheet1': ["a small luxury mansion facade with columns (home)", "a round compass rose (map)", "an open book with a ribbon bookmark (story)",
            "a slim skyscraper tower (business empire)", "a sleek smartphone with a tiny soft rose-pink heart on screen (contacts)",
            "a short stack of three gold coins (money)", "a lightning bolt (energy)",
            "a faceted gem crystal with a faint cool cyan inner glow (system points)", "a circular astrolabe dial with a constellation and a faint cool cyan glow (Tianshu system)"],
 'sheet2': ["a desk calendar page with a check mark (daily sign-in)", "a rolled scroll with a seal (quest list)", "a sealed envelope with a wax seal (mail)",
            "a gift box with a ribbon (shop)", "a trophy cup (leaderboard)", "a vintage camera (social moments)",
            "a gear cog (settings)", "a small bell (notification)", "a drawstring money pouch embossed with the Chinese yuan sign ¥ (not a dollar sign) (income)"],
 'sheet3': ["an ornate key (keys)", "a heart in soft rose-pink enamel framed in champagne metal (affection)", "a slim crown (tier)",
            "a medal with a ribbon (achievement)", "a hexagonal badge (title badge)", "a padlock (locked)",
            "a circular play button (start)", "an hourglass (time)", "a champagne bottle with one glass (celebration)"],
 'sheet4': ["a polished round jade stone with a soft muted green tone set in champagne metal (jade gambling)", "a small framed stock chart screen showing a rising line (stocks)",
            "a racing steering wheel (car race)", "a vintage studio microphone (live stream)", "a luxury cruise ship silhouette (cruise)",
            "a leather briefcase (deal)", "a crystal on a small pedestal with a faint cool cyan glow (skill)",
            "a fountain pen (contract)", "a pocket watch (spare)"],
}
