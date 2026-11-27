"""District local-map prompts (Seedream 5.5, 9:16). Spot markers in content/maps/haicheng.json
are positioned by hand on top of these images, so each prompt pins every landmark to a screen region.

usage: python3 scripts/assets/district_maps_prompts.py OUT_DIR [district_id ...]
"""
import os, subprocess, sys

STYLE = (
    "anime illustrated bird's-eye view map of one neighborhood at night, high oblique aerial angle, "
    "painterly cinematic Chinese urban otome mobile game art, deep navy and near-black tones, warm soft champagne street lights, "
    "glowing roads connecting the landmarks, each landmark clearly separated with open space around it so map markers can sit on it, "
    "low saturation, quiet premium mood, no people close up, no text, no letters, no signs with writing, no logos, no map pins, no location markers, no icons, no UI overlay, vertical 9:16 composition"
)

MAPS = {
    "old_street": "an old Chinese riverside quarter: TOP-LEFT a cluster of shabby old tenement apartments with laundry lines; TOP-RIGHT a traditional wooden two-storey teahouse with lanterns; CENTER a jade stone market courtyard with piles of rough boulders under string lights; MIDDLE-LEFT a row of antique shops with tiled roofs; MIDDLE-RIGHT a dark modern building with violet neon glow (e-sports club); LOWER-LEFT a narrow food stall alley full of red lanterns and steam; LOWER-RIGHT a small used-car lot beside an old wooden dock on the river; a corner street-front shop near the bottom center; winding cobblestone lanes",
    "university": "a university town with golden ginkgo trees: TOP a grand modern library with glass facade; UPPER-RIGHT a startup pitch hall with a big glass atrium; CENTER a long avenue lined with glowing golden ginkgo trees; MIDDLE-LEFT an old bookstore and a domed concert hall; LOWER-LEFT a cozy new-Chinese-style milk tea shop on a pedestrian street; LOWER-RIGHT a riverside residential apartment tower; BOTTOM-CENTER a small boutique scooter and compact car shop; lawns and footpaths",
    "bund": "a colonial-era riverside promenade with neoclassical stone buildings facing a wide river: TOP-LEFT a grand luxury hotel with a dome; TOP-RIGHT a rooftop fine-dining restaurant with panoramic windows; CENTER the long riverside promenade with lamp posts; MIDDLE-RIGHT a sleek glass supercar showroom with sports cars on display; LOWER-LEFT a modern penthouse residential tower; LOWER-RIGHT a closed-off waterfront road used as a race start grid with light strips; BOTTOM a riverside viewing platform; the river runs along the right edge",
    "cbd": "a futuristic financial district of glass skyscrapers: TOP-CENTER the tallest supertall twisted tower; UPPER-LEFT a stock exchange hall with a huge glowing ticker wall; UPPER-RIGHT a skyscraper facade lit as a giant light show; CENTER a plaza with fountains; MIDDLE-LEFT an elegant auction house with marble columns; MIDDLE-RIGHT a quantitative trading office tower with cyan light; LOWER-LEFT a bespoke luxury car atelier with limousines; LOWER-RIGHT a rooftop executive lounge; elevated walkways",
    "night_city": "a neon entertainment district: TOP-LEFT a big livestream studio building with LED screens; TOP-RIGHT a talent agency media tower; CENTER a neon pedestrian street with crowds as tiny dots; MIDDLE-LEFT a dim jazz lounge with warm amber windows; MIDDLE-RIGHT a small live music house; LOWER-LEFT a luxury duplex loft tower; LOWER-RIGHT a gritty tuning garage with drift cars and motorcycles under magenta neon; theater marquees without text",
    "peak_coast": "a hillside coast with a private marina: TOP a mansion estate on the mountaintop with gardens; UPPER-LEFT a golf course with clubhouse; UPPER-RIGHT a lighthouse on a cliff; CENTER a winding mountain road; MIDDLE-RIGHT an off-road vehicle depot; LOWER-LEFT a luxury cruise ship docked at a pier lit for a gala; LOWER-RIGHT a yacht marina with many white yachts and a sales pavilion; BOTTOM open sea with a yacht sailing at sunset afterglow",
    "airport": "a private business aviation terminal: TOP the runway with runway lights stretching away; UPPER-RIGHT a private jet hangar with a business jet; CENTER a sleek modern terminal building with glass; MIDDLE-LEFT a VIP lounge pavilion with a garden; LOWER-LEFT a jet sales showroom with a jet on display; LOWER-RIGHT helipad with a helicopter; BOTTOM an approach road with luxury cars",
}

if __name__ == "__main__":
    out = sys.argv[1]
    ids = sys.argv[2:] or list(MAPS)
    for i in ids:
        subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "gen_image.py"), os.path.join(out, f"map_{i}.png"), "9:16", f"{MAPS[i]}. {STYLE}"])
