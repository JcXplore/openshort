"""A YouTube link that is still live, or hours long, on a self-host.

A live link followed the live edge forever (the download never ended) and a
6 h finished stream was downloaded whole (~10 GB) and ran the machine out of
memory. Now a live stream is fetched from its start up to what has aired, and
self-host clips the picked range or, without one, the first N minutes.
"""
import pytest

from yt_clients import bound_live_fragments


def _live(target=5, started=1000.0):
    def gen(ctx):
        n = 0
        while True:  # a live feed: never ends on its own
            yield {"url": f"seg&sq={n}", "duration": target}
            n += 1
    fmt = {"is_from_start": True, "target_duration": target, "fragments": gen}
    return {"release_timestamp": started, "formats": [fmt, {"url": "hls"}]}, fmt


def test_stops_at_what_has_aired():
    info, fmt = _live()
    assert bound_live_fragments(info, None, now=1000.0 + 60)
    assert len(list(fmt["fragments"]({}))) == 12


def test_cap_shorter_than_the_air_time_wins():
    info, fmt = _live(target=2)
    assert bound_live_fragments(info, 30, now=1000.0 + 3600)
    assert len(list(fmt["fragments"]({}))) == 15


def test_nothing_to_bound_leaves_formats_alone():
    info, fmt = _live()
    info["release_timestamp"] = None
    gen = fmt["fragments"]
    assert not bound_live_fragments(info, None)
    assert fmt["fragments"] is gen
    assert not bound_live_fragments({"release_timestamp": 1.0, "formats": [{"url": "x"}]}, 60)


class TestSelfHostSourceCut:
    app_module = None

    @pytest.fixture(autouse=True)
    def _app(self):
        TestSelfHostSourceCut.app_module = pytest.importorskip("app")

    def test_picked_range_becomes_a_chosen_cut(self):
        cut = self.app_module.self_host_source_cut(("4800", "7200"))
        assert cut == {"start_seconds": 4800.0, "end_seconds": 7200.0,
                       "processed_minutes": 40.0, "chosen": True}

    def test_no_range_is_no_cut(self):
        assert self.app_module.self_host_source_cut(None) is None
        assert self.app_module.self_host_source_cut(("10", None)) is None

    def test_too_short_or_garbage_is_400(self):
        from fastapi import HTTPException
        for rng in (("0", "30"), ("a", "b")):
            with pytest.raises(HTTPException) as e:
                self.app_module.self_host_source_cut(rng)
            assert e.value.status_code == 400
