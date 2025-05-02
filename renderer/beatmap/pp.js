const rosu = require('rosu-pp-js');
const _ = require('lodash');

class CounterProcessor {
	Beatmap;
	osuContents;

	constructor (Beatmap, osuContents, mods_raw) {
		this.Beatmap = Beatmap;
		this.osuContents = osuContents;
		this.mods_raw = mods_raw;
	}

	async calculate () {
		const { Beatmap, osuContents, mods_raw } = this;

		let isSetOnLazer = Beatmap.Replay?.isSetOnLazer || false;
		let isUsingSliderHeadAccuracy = !(Beatmap.Mods.get('CL')?.no_slider_head_accuracy ?? false);
		if (Beatmap.options.stable) {
			isUsingSliderHeadAccuracy = false;
			isSetOnLazer = false;
		}
		if (Beatmap.options.lazer) {
			isUsingSliderHeadAccuracy = true;
			isSetOnLazer = true;
		}

		let rosu_mods = mods_raw;
		if (Beatmap.options.lazer) {
			rosu_mods = mods_raw.filter(mod => mod.acronym !== "CL");
		}

		const rosu_map = new rosu.Beatmap(osuContents);
		const rosu_diff = new rosu.Difficulty({
			mods: rosu_mods,
			clockRate: Beatmap.SpeedMultiplier,
			lazer: isSetOnLazer,
		});
		const rosu_perf = rosu_diff.gradualPerformance(rosu_map);

		const scoringFrames = Beatmap.ScoringFrames.filter(a => ['miss', 50, 100, 300].includes(a.result));

		for (const sf of scoringFrames) {
			const hitCount = sf.countMiss + sf.count50 + sf.count100 + sf.count300;

			if (hitCount < Beatmap.firstHitobjectIndex) continue;
			if (hitCount >= Beatmap.lastHitobjectIndex && hitCount != Beatmap.hitObjects.length) continue;

			let params = {
				maxCombo: sf.maxCombo,
				n300: sf.count300,
				n100: sf.count100,
				n50: sf.count50,
				misses: sf.countMiss
			};

			let numerator = 300 * sf.count300 + 100 * sf.count100 + 50 * sf.count50;
			let denominator = 300 * hitCount;

			if (isSetOnLazer) {
				params = {
					osuLargeTickHits: sf.largeTickHits,
					osuSmallTickHits: sf.smallTickHits,
					sliderEndHits: sf.sliderEndHits,
					...params,
				}

				const maxSliderEndHits = sf.sliderEndHits + sf.sliderEndMisses;
				const maxLargeTickHits = sf.largeTickMisses + sf.largeTickHits;
				const maxSmallTickHits = sf.smallTickMisses + sf.smallTickHits;

				if (isUsingSliderHeadAccuracy) {
					const sliderEndHits = Math.min(sf.sliderEndHits, maxSliderEndHits);
					const largeTickHits = Math.min(sf.largeTickHits, maxLargeTickHits);

					numerator += 150 * sliderEndHits + 30 * largeTickHits;
					denominator += 150 * maxSliderEndHits + 30 * maxLargeTickHits;
				} else {
					const largeTickHits = Math.min(sf.largeTickHits, maxLargeTickHits);
					const smallTickHits = maxSmallTickHits;

					numerator += 30 * largeTickHits + 10 * smallTickHits;
					denominator += 30 * largeTickHits + 10 * maxSmallTickHits;
				}
			}

			sf.accuracy = numerator / denominator * 100;

			let perfResult;
			if (hitCount == Beatmap.firstHitobjectIndex || hitCount == Beatmap.hitObjects.length) 
				perfResult = rosu_perf.nth(params, hitCount);
			else 
				perfResult = rosu_perf.next(params);

			const pp = perfResult?.pp ?? 0;
			const stars = perfResult?.difficulty.stars ?? 0;

			sf.pp = pp;
			sf.stars = stars;
		}
	}

	async backfill () {
		const { Beatmap } = this;
		let pp = 0, stars = 0, accuracy = 100;
		
		for(const scoringFrame of Beatmap.ScoringFrames){
			if(scoringFrame.pp != null){
				({pp, stars, accuracy} = scoringFrame)
			}
	
			scoringFrame.pp = pp;
			scoringFrame.stars = stars;
			scoringFrame.accuracy = accuracy;
		}
	
		const hitResults = _.countBy(Beatmap.ScoringFrames, 'result');
	
		hitResults.ur = Beatmap.ScoringFrames[Beatmap.ScoringFrames.length - 1].ur;
	
		Beatmap.HitResults = hitResults;

		Beatmap.Replay.Mods = [...Beatmap.Mods.keys()];
	}

	async process() {
		await this.calculate();
		await this.backfill()
	}
}

const applyCounter = async (Beatmap, osuContents, mods_raw) => {
	await new CounterProcessor(Beatmap, osuContents, mods_raw).process();
};

module.exports = applyCounter;
