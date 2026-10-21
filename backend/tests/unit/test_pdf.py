from app.pdf import FONT_FETCH_MS, FONT_HOSTS, _font_route, print_url


class FakeRoute:
    def __init__(self, fail: bool) -> None:
        self.fail = fail
        self.calls: list[str] = []

    def fetch(self, timeout: int):
        self.calls.append(f"fetch {timeout}")
        if self.fail:
            raise TimeoutError("offline")
        return "response"

    def fulfill(self, response) -> None:
        self.calls.append(f"fulfill {response}")

    def abort(self) -> None:
        self.calls.append("abort")


def test_a_font_that_arrives_is_passed_on_within_a_short_wait():
    route = FakeRoute(fail=False)
    _font_route(route)
    assert route.calls == [f"fetch {FONT_FETCH_MS}", "fulfill response"]
    assert FONT_FETCH_MS <= 5000


def test_a_font_that_cannot_be_fetched_is_dropped_so_the_pdf_goes_on_without_it():
    route = FakeRoute(fail=True)
    _font_route(route)
    assert route.calls == [f"fetch {FONT_FETCH_MS}", "abort"]


def test_only_google_font_hosts_get_the_short_wait():
    assert FONT_HOSTS.match("https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR")
    assert FONT_HOSTS.match("https://fonts.gstatic.com/s/x.woff2")
    assert not FONT_HOSTS.match("http://localhost:5180/assets/app.js")


def test_print_url():
    assert print_url("http://localhost:5180/", 3, "career") == "http://localhost:5180/print/documents/3/career"
