#!/usr/bin/env python
"""
Write <field>_wavelength_tour_linear.html and waypoints_<field>_wavelength_linear.json
for fields whose adjacent-filter RGB HiPS live in avm_images.

Each tour is one waypoint with a wavelength slider; each slider step is an RGB
layer of three neighbouring filters (R = reddest), named
<prefix>_RGB_<r>-<g>-<b>_hips.  The page is wd2_wavelength_tour_linear.html
with the title, description, waypoint file, and initial layer replaced.

The layers come from jwst_scripts/scripts/adjacent_rgb_layers.py (Sgr A*,
Sgr C, Clouds E/F), arches_rgb_images.py on the combined 2045 + 10678 Arches
mosaics, and sickle_rgb_images.py.

Usage:
    make_linear_tours.py [FIELD ...]     # default: all fields below
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
AVM = "/orange/adamginsburg/web/public/avm_images"
TEMPLATE = "wd2_wavelength_tour_linear.html"

# field -> title, layer prefix, triplets (R, G, B), optional view override.
TOURS = {
    "arches": {
        "title": "Arches Wavelength Explorer (Linear)",
        "prefix": "arches_2045_10678",
        "triplets": [(480, 323, 212), (770, 480, 323)],
    },
    "sickle": {
        "title": "Sickle Wavelength Explorer (Linear)",
        "prefix": "Sickle",
        "triplets": [(335, 210, 187), (470, 335, 210), (480, 470, 335),
                     (770, 480, 470), (1130, 770, 480), (1500, 1130, 770)],
        # The view of sickle_wavelength_tour.html.
        "view": {"ra": 266.566301, "dec": -28.8016023, "fov": 0.05},
    },
    "sgra": {
        "title": "Sgr A* Wavelength Explorer (Linear)",
        "prefix": "SgrA",
        "triplets": [(405, 212, 115), (560, 405, 212), (770, 560, 405),
                     (1000, 770, 560), (1280, 1000, 770), (1500, 1280, 1000)],
    },
    "sgrc": {
        "title": "Sgr C Wavelength Explorer (Linear)",
        "prefix": "SGRC",
        "triplets": [(182, 162, 115), (212, 182, 162), (360, 212, 182),
                     (405, 360, 212), (470, 405, 360), (480, 470, 405)],
    },
    "cloudef": {
        "title": "Clouds E/F Wavelength Explorer (Linear)",
        "prefix": "Cloudef",
        "triplets": [(360, 210, 162), (480, 360, 210), (770, 480, 360),
                     (2100, 770, 480)],
    },
}


def label(wave):
    return f"{wave / 100:.2f}μm" if wave < 1000 else f"{wave / 100:.1f}μm"


def layer(tour, trip):
    return "{}_RGB_{}-{}-{}_hips".format(tour["prefix"], *trip)


def properties(name):
    props = {}
    with open(os.path.join(AVM, name, "properties")) as fh:
        for ln in fh:
            if "=" in ln:
                k, v = ln.split("=", 1)
                props[k.strip()] = v.strip()
    return props


def write(field):
    tour = TOURS[field]
    trips = sorted(tour["triplets"], key=lambda t: t[0])
    missing = [layer(tour, t) for t in trips
               if not os.path.exists(os.path.join(AVM, layer(tour, t),
                                                  "properties"))]
    if missing:
        raise FileNotFoundError(f"{field}: layers not in {AVM}: {missing}")
    steps = []
    for trip in trips:
        desc = " / ".join(label(w) for w in trip)
        steps.append({"wavelength": trip[0], "url": layer(tour, trip),
                      "label": f"RGB: {desc}", "description": desc})
    view = tour.get("view")
    if view is None:
        p = properties(steps[0]["url"])
        view = {"ra": round(float(p["hips_initial_ra"]), 7),
                "dec": round(float(p["hips_initial_dec"]), 7),
                "fov": round(float(p["hips_initial_fov"]), 3)}
    wp = {"waypoints": [{
        **view, "transition_fov": view["fov"], "transition_time": 3,
        "zoom_out_time": 2, "zoom_in_time": 3, "title": tour["title"],
        "description": " → ".join(s["description"] for s in steps),
        "pause_time": 300000,
        "wavelength_slider": {"enabled": True, "wavelengths": steps},
    }]}
    jname = f"waypoints_{field}_wavelength_linear.json"
    with open(os.path.join(HERE, jname), "w") as fh:
        json.dump(wp, fh, indent=4, ensure_ascii=False)
        fh.write("\n")

    with open(os.path.join(HERE, TEMPLATE)) as fh:
        html = fh.read()
    first = "/".join(label(w) for w in trips[0])
    last = "/".join(label(w) for w in trips[-1])
    for old, new in [
            ("Westerlund 2 Wavelength Explorer (Linear)", tour["title"]),
            ("Linear wavelength sequence from 1.62μm/1.50μm/1.15μm (NIRCam) "
             "to 11.3μm/10.0μm/7.70μm (MIRI).",
             f"Linear wavelength sequence from {first} to {last}."),
            ("waypoints_wd2_wavelength_linear.json", jname),
            ("wd2_RGB_162-150-115_hips", steps[0]["url"])]:
        if old not in html:
            raise ValueError(f"{TEMPLATE} no longer contains {old!r}")
        html = html.replace(old, new)
    hname = f"{field}_wavelength_tour_linear.html"
    with open(os.path.join(HERE, hname), "w") as fh:
        fh.write(html)
    print(f"wrote {hname} + {jname}: {len(steps)} steps, {first} → {last}")


def main():
    for field in sys.argv[1:] or TOURS:
        write(field)


if __name__ == "__main__":
    main()
