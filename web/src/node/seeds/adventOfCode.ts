import type { RepoSeed } from "./types";

const readme = `# advent-of-code

My solutions to the December puzzle calendar at puzzles.example.org, in
OCaml. Everyone in our group chat calls it advent of code, so that's the
repo name.

One puzzle a day from the 1st to the 25th, each in two parts. Part 2 is
revealed when you solve part 1 and usually breaks whatever shortcut you took
in part 1.

## Running

    opam install dune
    dune build
    dune exec aoc -- 2024 3            # reads inputs/2024/day03.txt
    dune exec aoc -- 2024 3 my.txt     # or any file

Inputs are personal and the puzzle authors ask people not to publish them,
so inputs/ is gitignored. Download yours from the site.

## Layout

- lib/aoc: parsing helpers shared by every day (lines, ints, grids)
- lib/y2024, ...: one module per day, each with a solve function that takes
  the raw input and returns both answers as strings
- lib/all: the table of every solved day, used by the runner
- bin: the runner

No dependencies beyond the standard library, str and unix. That's a rule.
`;

const duneProject = `(lang dune 3.10)

(name aoc)
`;

const duneProject316 = `(lang dune 3.16)

(name aoc)
`;

const gitignore = `_build/
inputs/
*.install
.session
`;

const ocamlformat = `profile = default
version = 0.26.2
margin = 90
`;

const binDune = `(executable
 (name main)
 (public_name aoc)
 (libraries aoc all unix))
`;

const mainMl = String.raw`let usage () =
  prerr_endline "usage: aoc YEAR DAY [INPUT]";
  exit 2

let () =
  match List.tl (Array.to_list Sys.argv) with
  | year :: day :: rest -> (
      let year = int_of_string year and day = int_of_string day in
      let path =
        match rest with
        | [ p ] -> p
        | _ -> Printf.sprintf "inputs/%d/day%02d.txt" year day
      in
      match All.find year day with
      | None ->
          Printf.eprintf "no solution for %d day %d yet\n" year day;
          exit 1
      | Some solve ->
          let input = Aoc.read_file path in
          let t0 = Unix.gettimeofday () in
          let p1, p2 = solve input in
          let ms = (Unix.gettimeofday () -. t0) *. 1000. in
          Printf.printf "part 1: %s\npart 2: %s\n(%.1f ms)\n" p1 p2 ms)
  | _ -> usage ()
`;

const aocDune = `(library
 (name aoc)
 (libraries str))
`;

const aocMl = String.raw`(* Helpers shared by every day. Inputs are small, so everything here favours
   being obvious over being fast. *)

let read_file path = In_channel.with_open_bin path In_channel.input_all

(* Non-empty lines, without surrounding whitespace. *)
let lines s =
  String.split_on_char '\n' s |> List.map String.trim |> List.filter (fun l -> l <> "")

(* Blocks separated by blank lines, each as a list of lines. *)
let paragraphs s =
  let rec go acc cur = function
    | [] -> List.rev (if cur = [] then acc else List.rev cur :: acc)
    | "" :: rest -> go (if cur = [] then acc else List.rev cur :: acc) [] rest
    | l :: rest -> go acc (l :: cur) rest
  in
  String.split_on_char '\n' s |> List.map String.trim |> go [] []

let int_re = Str.regexp "-?[0-9]+"

(* Every integer in a string, in order: "x=3, y=-12" gives [3; -12]. *)
let ints s =
  let rec go pos acc =
    match Str.search_forward int_re s pos with
    | exception Not_found -> List.rev acc
    | _ -> go (Str.match_end ()) (int_of_string (Str.matched_string s) :: acc)
  in
  go 0 []

let sum = List.fold_left ( + ) 0
let maximum = List.fold_left max min_int

module Grid = struct
  type t = char array array

  let of_string s : t =
    lines s |> List.map (fun l -> Array.init (String.length l) (String.get l)) |> Array.of_list

  let rows (g : t) = Array.length g
  let cols (g : t) = if rows g = 0 then 0 else Array.length g.(0)
  let inside g (r, c) = r >= 0 && c >= 0 && r < rows g && c < cols g
  let get (g : t) (r, c) = g.(r).(c)
  let dirs4 = [ (-1, 0); (0, 1); (1, 0); (0, -1) ]
  let dirs8 = [ (-1, -1); (-1, 0); (-1, 1); (0, -1); (0, 1); (1, -1); (1, 0); (1, 1) ]

  let neighbours dirs g (r, c) =
    List.filter_map
      (fun (dr, dc) ->
        let p = (r + dr, c + dc) in
        if inside g p then Some p else None)
      dirs

  let fold f acc (g : t) =
    let acc = ref acc in
    Array.iteri (fun r row -> Array.iteri (fun c ch -> acc := f !acc (r, c) ch) row) g;
    !acc
end
`;

const allDune = `(library
 (name all)
 (libraries y2024))
`;

const allMl = String.raw`(* Every solved day, keyed by (year, day). *)

type solution = string -> string * string

let solutions : ((int * int) * solution) list =
  [
    ((2024, 1), Y2024.Day01.solve);
    ((2024, 2), Y2024.Day02.solve);
    ((2024, 3), Y2024.Day03.solve);
    ((2024, 4), Y2024.Day04.solve);
  ]

let find year day = List.assoc_opt (year, day) solutions
`;

const y2024Dune = `(library
 (name y2024)
 (libraries aoc))
`;

const y2025Dune = `(library
 (name y2025)
 (libraries aoc))
`;

const y2024Day01 = String.raw`(* 2024 day 1: Snow depths.

   Each line holds one day's readings from a snow gauge. Part 1 adds up the
   deepest reading of every day. Part 2 counts the days on which the
   readings only ever went up. *)

let rec increasing = function
  | a :: (b :: _ as rest) -> a < b && increasing rest
  | _ -> true

let solve input =
  let days = Aoc.lines input |> List.map Aoc.ints in
  let part1 = days |> List.map Aoc.maximum |> Aoc.sum in
  let part2 = days |> List.filter increasing |> List.length in
  (string_of_int part1, string_of_int part2)
`;

const y2024Day02 = String.raw`(* 2024 day 2: Bell tower.

   Each line is the order a band of ringers rang their bells in, e.g. "3142".
   Swapping two neighbouring bells costs one change. Part 1 is the total
   number of changes to get every line back to rounds (1234...). Part 2 is
   the line that needs the most. *)

let digits s = List.init (String.length s) (fun i -> Char.code s.[i] - Char.code '0')

(* Adjacent swaps needed to sort = number of inversions. Lines are short, so
   counting pairs is fine. *)
let inversions xs =
  let a = Array.of_list xs in
  let n = Array.length a in
  let count = ref 0 in
  for i = 0 to n - 1 do
    for j = i + 1 to n - 1 do
      if a.(i) > a.(j) then incr count
    done
  done;
  !count

let solve input =
  let rows = Aoc.lines input |> List.map (fun l -> (l, inversions (digits l))) in
  let part1 = rows |> List.map snd |> Aoc.sum in
  let part2, _ =
    List.fold_left (fun (best, n) (l, m) -> if m > n then (l, m) else (best, n)) ("", -1) rows
  in
  (string_of_int part1, part2)
`;

const y2024Day03 = String.raw`(* 2024 day 3: Crate stacks.

   A grid of digits gives the height of each stack of crates in the
   warehouse. Part 1 counts the stacks taller than all four of their
   neighbours. Part 2 is the size of the largest group of touching stacks
   that all have the same height. *)

open Aoc

let peak g p =
  let h = Grid.get g p in
  List.for_all (fun q -> Grid.get g q < h) (Grid.neighbours Grid.dirs4 g p)

let region_size g seen start =
  let h = Grid.get g start in
  let rec go acc = function
    | [] -> acc
    | ((r, c) as p) :: rest ->
        if seen.(r).(c) || Grid.get g p <> h then go acc rest
        else (
          seen.(r).(c) <- true;
          go (acc + 1) (Grid.neighbours Grid.dirs4 g p @ rest))
  in
  go 0 [ start ]

let solve input =
  let g = Grid.of_string input in
  let part1 = Grid.fold (fun n p _ -> if peak g p then n + 1 else n) 0 g in
  let seen = Array.make_matrix (Grid.rows g) (Grid.cols g) false in
  let part2 = Grid.fold (fun best p _ -> max best (region_size g seen p)) 0 g in
  (string_of_int part1, string_of_int part2)
`;

const y2024Day04 = String.raw`(* 2024 day 4: Sleigh route.

   The route is a comma-separated list of moves like "N3" or "W10" on a
   square grid. Part 1 is how far (Manhattan distance) the sleigh ends up
   from where it started. Part 2 is the distance to the first point the
   route passes through twice. *)

let parse input =
  String.split_on_char ',' (String.trim input)
  |> List.map (fun m ->
         let m = String.trim m in
         (m.[0], int_of_string (String.sub m 1 (String.length m - 1))))

let step (x, y) = function
  | 'N' -> (x, y + 1)
  | 'S' -> (x, y - 1)
  | 'E' -> (x + 1, y)
  | 'W' -> (x - 1, y)
  | c -> failwith (Printf.sprintf "unknown direction %c" c)

let dist (x, y) = abs x + abs y

let solve input =
  let seen = Hashtbl.create 1024 in
  Hashtbl.replace seen (0, 0) ();
  let first_twice = ref None in
  let walk pos (dir, n) =
    let pos = ref pos in
    for _ = 1 to n do
      pos := step !pos dir;
      if !first_twice = None && Hashtbl.mem seen !pos then first_twice := Some !pos;
      Hashtbl.replace seen !pos ()
    done;
    !pos
  in
  let final = List.fold_left walk (0, 0) (parse input) in
  let part2 = match !first_twice with Some p -> string_of_int (dist p) | None -> "none" in
  (string_of_int (dist final), part2)
`;

const testDune = `(tests
 (names test_examples)
 (libraries y2024))
`;

const testExamples = String.raw`(* The worked examples from each puzzle description. Real inputs aren't in
   the repo, so these are what keeps refactors honest. *)

let failures = ref 0

let check name expected actual =
  if expected <> actual then (
    incr failures;
    Printf.printf "FAIL %s: expected %s, got %s\n" name expected actual)

let both name (e1, e2) (a1, a2) =
  check (name ^ " part 1") e1 a1;
  check (name ^ " part 2") e2 a2

let () =
  both "2024/01" ("19", "1") (Y2024.Day01.solve "3,5,9\n4,2,8\n1,1,2\n");
  both "2024/02" ("9", "4321") (Y2024.Day02.solve "3142\n1234\n4321\n");
  both "2024/04" ("3", "1") (Y2024.Day04.solve "N2,E2,S1,W4\n");
  if !failures > 0 then exit 1;
  print_endline "all examples pass"
`;

const benchDune = `(executable
 (name bench)
 (libraries aoc all unix))
`;

const benchMl = String.raw`(* Times every solved day against its real input: three warm-up runs, then
   the median of [runs]. Run from the repo root:

     dune exec --profile release bench/bench.exe *)

let runs = 15

let time f =
  let t0 = Unix.gettimeofday () in
  ignore (Sys.opaque_identity (f ()));
  Unix.gettimeofday () -. t0

let median xs =
  let a = Array.of_list xs in
  Array.sort compare a;
  a.(Array.length a / 2)

let () =
  List.iter
    (fun ((year, day), solve) ->
      let path = Printf.sprintf "inputs/%d/day%02d.txt" year day in
      if Sys.file_exists path then begin
        let input = Aoc.read_file path in
        for _ = 1 to 3 do
          ignore (solve input)
        done;
        let ms = median (List.init runs (fun _ -> time (fun () -> solve input))) *. 1000. in
        Printf.printf "%d day %02d %10.2f ms\n%!" year day ms
      end)
    All.solutions
`;

const altReadme = `# Alternative solutions

Friends racing me send their versions here. They aren't built (there's no
dune file in alt/), they're just for reading and gloating. Each one says how
long it took to write, honestly or otherwise.
`;

const priyaDay01 = String.raw`(* priya, 2025 day 1. 6 min 12 s from unlock to both stars. One pass, no lists. *)

let solve input =
  String.split_on_char '\n' input
  |> List.fold_left
       (fun (count, total) line ->
         let line = String.trim line in
         match int_of_string_opt line with
         | None -> (count, total)
         | Some n ->
             let s = String.fold_left (fun a c -> a + Char.code c - 48) 0 line in
             if n mod s = 0 then (count + 1, total + n) else (count, total))
       (0, 0)
  |> fun (c, t) -> (string_of_int c, string_of_int t)
`;

const priyaDay05 = String.raw`(* priya, 2025 day 5. Part 1 only, by plain recursion, because Theo said
   the DP was "obviously necessary". It runs in 40 ms on my input. *)

let rec ways target = function
  | _ when target = 0 -> 1
  | [] -> 0
  | t :: rest -> ways target rest + if t <= target then ways (target - t) rest else 0

let solve input =
  match Aoc.lines input |> List.map int_of_string with
  | target :: tins -> (string_of_int (ways target tins), "see theo's")
  | [] -> ("", "")
`;

const malikDay06 = String.raw`(* malik, 2025 day 6, part 2 as a 0-1 BFS: stepping onto a drift costs one
   "break", everything else is free, so a deque gives the fewest breaks to
   every cell. Not what the puzzle asked, but I misread it and it's pretty. *)

open Aoc

let fewest_breaks g start goal =
  let best = Hashtbl.create 4096 in
  let rec go front back =
    match front, back with
    | [], [] -> Hashtbl.find_opt best goal
    | [], back -> go (List.rev back) []
    | (p, b) :: front, back ->
        if Hashtbl.mem best p then go front back
        else (
          Hashtbl.add best p b;
          let free, costly =
            List.partition (fun n -> Grid.get g n <> '#') (Grid.neighbours Grid.dirs4 g p)
          in
          go (List.map (fun n -> (n, b)) free @ front) (List.map (fun n -> (n, b + 1)) costly @ back))
  in
  go [ (start, 0) ] []
`;

const y2025Day01 = String.raw`(* 2025 day 1: Lantern wicks.

   Each line is the length of a wick in millimetres. A wick burns evenly
   only if its length is divisible by the sum of its digits. Part 1 counts
   the even burners; part 2 adds up their lengths. *)

let rec digit_sum n = if n < 10 then n else (n mod 10) + digit_sum (n / 10)

let solve input =
  let even =
    Aoc.lines input |> List.map int_of_string |> List.filter (fun n -> n mod digit_sum n = 0)
  in
  (string_of_int (List.length even), string_of_int (Aoc.sum even))
`;

const y2025Day02 = String.raw`(* 2025 day 2: Frost on the window.

   A grid of clear (.) and frosted (#) panes. Each minute, a clear pane
   freezes if exactly three of its eight neighbours are frosted, and a
   frosted pane thaws if fewer than two or more than four are. Part 1 counts
   frosted panes after 10 minutes. Part 2 is the first minute at which the
   window looks exactly like it did at some earlier minute. *)

open Aoc

let frosted g p = Grid.get g p = '#'

let next g =
  Array.mapi
    (fun r row ->
      Array.mapi
        (fun c ch ->
          let n = List.length (List.filter (frosted g) (Grid.neighbours Grid.dirs8 g (r, c))) in
          match ch with
          | '.' when n = 3 -> '#'
          | '#' when n < 2 || n > 4 -> '.'
          | ch -> ch)
        row)
    g

let count g = Grid.fold (fun n p _ -> if frosted g p then n + 1 else n) 0 g
let rec iterate n f x = if n = 0 then x else iterate (n - 1) f (f x)

(* Keeps every earlier grid in a list and compares against all of them. *)
let first_repeat g =
  let rec go minute seen g =
    if List.exists (fun s -> s = g) seen then minute else go (minute + 1) (g :: seen) (next g)
  in
  go 0 [] g

let solve input =
  let g = Grid.of_string input in
  (string_of_int (count (iterate 10 next g)), string_of_int (first_repeat g))
`;

const firstRepeatList = String.raw`(* Keeps every earlier grid in a list and compares against all of them. *)
let first_repeat g =
  let rec go minute seen g =
    if List.exists (fun s -> s = g) seen then minute else go (minute + 1) (g :: seen) (next g)
  in
  go 0 [] g
`;

const firstRepeatHashtbl = String.raw`(* The whole grid as one string, row after row, to use as a table key. *)
let key g =
  String.concat "" (Array.to_list (Array.map (fun row -> String.init (Array.length row) (Array.get row)) g))

(* Remembers every grid seen so far by its contents. *)
let first_repeat g =
  let seen = Hashtbl.create 4096 in
  let rec go minute g =
    let k = key g in
    if Hashtbl.mem seen k then minute
    else (
      Hashtbl.add seen k ();
      go (minute + 1) (next g))
  in
  go 0 g
`;

const firstRepeatHash = String.raw`(* Remembers a hash of every grid seen so far. *)
let first_repeat g =
  let seen = Hashtbl.create 4096 in
  let rec go minute g =
    let h = Hashtbl.hash g in
    if Hashtbl.mem seen h then minute
    else (
      Hashtbl.add seen h ();
      go (minute + 1) (next g))
  in
  go 0 g
`;

const y2025Day03 = String.raw`(* 2025 day 3: Ribbon.

   Each line marks a stretch of ribbon that's already been used, as
   "start-end" in centimetres, both ends included. Stretches overlap. Part 1
   is how much ribbon is used in total. Part 2 is the longest unused piece
   between two used stretches. *)

let parse line =
  match String.split_on_char '-' line with
  | [ a; b ] -> (int_of_string a, int_of_string b)
  | _ -> failwith ("bad range: " ^ line)

let merge ranges =
  List.sort compare ranges
  |> List.fold_left
       (fun acc (lo, hi) ->
         match acc with
         | (plo, phi) :: rest when lo <= phi -> (plo, max hi phi) :: rest
         | _ -> (lo, hi) :: acc)
       []
  |> List.rev

let rec gaps = function
  | (_, hi) :: ((lo, _) :: _ as rest) -> (lo - hi) :: gaps rest
  | _ -> []

let solve input =
  let merged = Aoc.lines input |> List.map parse |> merge in
  let used = merged |> List.map (fun (lo, hi) -> hi - lo + 1) |> Aoc.sum in
  (string_of_int used, string_of_int (Aoc.maximum (gaps merged)))
`;

const y2025Day04 = String.raw`(* 2025 day 4: Choir seating.

   Each rule says one singer must walk on stage before another, as
   "Ada before Bram". Part 1 is the walk-on order, taking the alphabetically
   first singer whenever several are free to go. Part 2 is the length of the
   longest chain of singers who each have to wait for the one before. *)

module S = Set.Make (String)

let parse input =
  Aoc.lines input
  |> List.map (fun l ->
         match String.split_on_char ' ' l with
         | [ a; "before"; b ] -> (a, b)
         | _ -> failwith ("bad rule: " ^ l))

let singers rules = List.fold_left (fun s (a, b) -> S.add a (S.add b s)) S.empty rules

let order rules =
  let rec go placed remaining acc =
    if S.is_empty remaining then List.rev acc
    else
      let free =
        S.filter (fun s -> List.for_all (fun (a, b) -> b <> s || S.mem a placed) rules) remaining
      in
      let next = S.min_elt free in
      go (S.add next placed) (S.remove next remaining) (next :: acc)
  in
  go S.empty (singers rules) []

let longest_chain rules =
  let memo = Hashtbl.create 64 in
  let rec depth s =
    match Hashtbl.find_opt memo s with
    | Some d -> d
    | None ->
        let d = 1 + List.fold_left (fun m (a, b) -> if b = s then max m (depth a) else m) 0 rules in
        Hashtbl.add memo s d;
        d
  in
  S.fold (fun s m -> max m (depth s)) (singers rules) 0

let solve input =
  let rules = parse input in
  (String.concat "," (order rules), string_of_int (longest_chain rules))
`;

const y2025Day05 = String.raw`(* 2025 day 5: Cocoa tins.

   The first line is how much hot cocoa (in ml) needs storing; the rest are
   the sizes of the tins on the shelf. Part 1 counts the ways to pick tins
   that hold exactly that much, every tin full. Part 2 pretends the shop has
   as many of each size as you like, and asks for the fewest tins that
   would do it. *)

let parse input =
  match Aoc.lines input |> List.map int_of_string with
  | target :: tins -> (target, tins)
  | [] -> failwith "empty input"

(* ways.(v) is the number of subsets of the tins seen so far that add up to v. *)
let count_subsets target tins =
  let ways = Array.make (target + 1) 0 in
  ways.(0) <- 1;
  List.iter
    (fun t ->
      for v = target downto t do
        ways.(v) <- ways.(v) + ways.(v - t)
      done)
    tins;
  ways.(target)

let fewest target tins =
  let inf = max_int / 2 in
  let best = Array.make (target + 1) inf in
  best.(0) <- 0;
  for v = 1 to target do
    List.iter (fun t -> if t <= v then best.(v) <- min best.(v) (best.(v - t) + 1)) tins
  done;
  if best.(target) >= inf then -1 else best.(target)

let solve input =
  let target, tins = parse input in
  (string_of_int (count_subsets target tins), string_of_int (fewest target tins))
`;

const y2025Day06 = String.raw`(* 2025 day 6: Snowplow.

   A map of the village: S is the depot, E is the school, # is a snowdrift
   and . is a clear street. Part 1 is the fewest moves from S to E. Part 2
   lets the plow push through one drift on the way. *)

open Aoc

let find g ch =
  Grid.fold (fun acc p c -> if c = ch then Some p else acc) None g |> Option.get

(* Breadth-first over (position, drifts pushed through so far). *)
let bfs g ~breaks =
  let start = find g 'S' and goal = find g 'E' in
  let dist = Hashtbl.create 4096 in
  let q = Queue.create () in
  Hashtbl.add dist (start, 0) 0;
  Queue.add (start, 0) q;
  let rec loop () =
    if Queue.is_empty q then None
    else
      let ((p, used) as state) = Queue.pop q in
      let d = Hashtbl.find dist state in
      if p = goal then Some d
      else (
        List.iter
          (fun n ->
            let used' = if Grid.get g n = '#' then used + 1 else used in
            if used' <= breaks && not (Hashtbl.mem dist (n, used')) then (
              Hashtbl.add dist (n, used') (d + 1);
              Queue.add (n, used') q))
          (Grid.neighbours Grid.dirs4 g p);
        loop ())
  in
  loop ()

let show = function Some d -> string_of_int d | None -> "unreachable"

let solve input =
  let g = Grid.of_string input in
  (show (bfs g ~breaks:0), show (bfs g ~breaks:1))
`;

const y2025Day06AStar = String.raw`(* 2025 day 6: Snowplow.

   A map of the village: S is the depot, E is the school, # is a snowdrift
   and . is a clear street. Part 1 is the fewest moves from S to E. Part 2
   lets the plow push through one drift on the way. *)

open Aoc

(* Ordered by estimated total cost first, so min_elt is the next to expand. *)
module Pq = Set.Make (struct
  type t = int * ((int * int) * int)

  let compare = compare
end)

let manhattan (r1, c1) (r2, c2) = abs (r1 - r2) + abs (c1 - c2)

(* A* over (position, drifts pushed through so far), with Manhattan distance
   to the school as the estimate. It never overestimates, so the first time
   we pop the goal we have the shortest route. *)
let astar g ~breaks =
  let start = Grid.find g 'S' and goal = Grid.find g 'E' in
  let dist = Hashtbl.create 4096 in
  Hashtbl.add dist (start, 0) 0;
  let rec loop frontier =
    match Pq.min_elt_opt frontier with
    | None -> None
    | Some ((_, ((p, used) as state)) as top) ->
        let frontier = Pq.remove top frontier in
        let d = Hashtbl.find dist state in
        if p = goal then Some d
        else
          Grid.neighbours Grid.dirs4 g p
          |> List.fold_left
               (fun frontier n ->
                 let used' = if Grid.get g n = '#' then used + 1 else used in
                 let better =
                   match Hashtbl.find_opt dist (n, used') with
                   | Some d' -> d + 1 < d'
                   | None -> true
                 in
                 if used' <= breaks && better then (
                   Hashtbl.replace dist (n, used') (d + 1);
                   Pq.add (d + 1 + manhattan n goal, (n, used')) frontier)
                 else frontier)
               frontier
          |> loop
  in
  loop (Pq.singleton (manhattan start goal, (start, 0)))

let show = function Some d -> string_of_int d | None -> "unreachable"

let solve input =
  let g = Grid.of_string input in
  (show (astar g ~breaks:0), show (astar g ~breaks:1))
`;

const y2025Day07 = String.raw`(* 2025 day 7: Sleigh bells.

   Each line describes one bell as "period @ first", e.g. "7 @ 3": it rings
   at minute 3 and then every 7 minutes. Part 1 is the first minute after 0
   at which every bell would ring together if they all started at minute 0.
   Part 2 is the first minute at which they really do all ring together. *)

let parse input =
  Aoc.lines input
  |> List.map (fun l -> match Aoc.ints l with [ p; o ] -> (p, o) | _ -> failwith l)

let rec gcd a b = if b = 0 then a else gcd b (a mod b)
let lcm a b = a / gcd a b * b

(* Sieve: walk in steps of the combined period until the next bell lines
   up. The periods are pairwise coprime in every input I've seen. *)
let together bells =
  List.fold_left
    (fun (t, step) (p, o) ->
      let t = ref t in
      while !t mod p <> o do
        t := !t + step
      done;
      (!t, lcm step p))
    (0, 1) bells
  |> fst

let solve input =
  let bells = parse input in
  let part1 = List.fold_left (fun acc (p, _) -> lcm acc p) 1 bells in
  (string_of_int part1, string_of_int (together bells))
`;

const y2025Day08 = String.raw`(* 2025 day 8: Secret gift exchange.

   Each line says who gives a present to whom, "Ada -> Bram". Everyone gives
   exactly one present and gets exactly one. Part 1 counts the separate
   gift circles. Part 2 is the size of the biggest one. *)

let parse input =
  let gives = Hashtbl.create 256 in
  Aoc.lines input
  |> List.iter (fun l ->
         match String.split_on_char ' ' l with
         | [ a; "->"; b ] -> Hashtbl.replace gives a b
         | _ -> failwith ("bad line: " ^ l));
  gives

let circles gives =
  let seen = Hashtbl.create 256 in
  Hashtbl.fold
    (fun start _ acc ->
      if Hashtbl.mem seen start then acc
      else
        let rec walk p n =
          if Hashtbl.mem seen p then n
          else (
            Hashtbl.add seen p ();
            walk (Hashtbl.find gives p) (n + 1))
        in
        walk start 0 :: acc)
    gives []

let solve input =
  let sizes = circles (parse input) in
  (string_of_int (List.length sizes), string_of_int (Aoc.maximum sizes))
`;

const fetchInput = String.raw`#!/bin/sh
# Download a puzzle input: scripts/fetch-input 2025 3
# Needs your session cookie in .session (gitignored, never commit it).
set -eu

year=$1
day=$2
out=$(printf 'inputs/%d/day%02d.txt' "$year" "$day")

if [ -f "$out" ]; then
  echo "$out already exists" >&2
  exit 0
fi

mkdir -p "$(dirname "$out")"
curl -fsS -A "theo's input fetcher (theo@example.org)" \
  -H "Cookie: session=$(cat .session)" \
  -o "$out" \
  "https://puzzles.example.org/$year/day/$day/input"
echo "wrote $out"
`;

const newDay = String.raw`#!/bin/sh
# Start a new day: scripts/new-day 2026 1
set -eu

year=$1
day=$(printf '%02d' "$2")
dir=lib/y$year
file=$dir/day$day.ml

mkdir -p "$dir"
[ -f "$dir/dune" ] || printf '(library\n (name y%s)\n (libraries aoc))\n' "$year" > "$dir/dune"
if [ -f "$file" ]; then
  echo "$file already exists" >&2
  exit 1
fi
sed "s/YEAR/$year/; s/DAY/$2/" template/day.ml > "$file"
scripts/fetch-input "$year" "$2"
echo "created $file"
`;

const templateDay = String.raw`(* YEAR day DAY: TITLE.

   What the puzzle asks, in my own words, so this still makes sense in a
   year when I've forgotten everything. *)

let solve input =
  let lines = Aoc.lines input in
  ignore lines;
  ("todo", "todo")
`;

export const adventOfCode: RepoSeed = {
  owner: { person: "theo" },
  name: "advent-of-code",
  description:
    "My solutions to the December puzzle calendar, in OCaml. A runner, parsing helpers, benchmarks, and friends' faster versions to keep me humble.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["theo"],
  threshold: 1,
  seeding: 5,
  files: {
    "README.md": readme,
    "dune-project": duneProject,
    ".gitignore": gitignore,
    "bin/dune": binDune,
    "bin/main.ml": mainMl,
    "lib/aoc/dune": aocDune,
    "lib/aoc/aoc.ml": aocMl,
    "lib/all/dune": allDune,
    "lib/all/all.ml": allMl,
    "lib/y2024/dune": y2024Dune,
    "lib/y2024/day01.ml": y2024Day01,
    "lib/y2024/day02.ml": y2024Day02,
    "lib/y2024/day03.ml": y2024Day03,
    "lib/y2024/day04.ml": y2024Day04,
  },
  root: {
    label: "root",
    message: `Port last year's solutions to dune

Last December was four days of scripts in a scratch folder before life got
in the way. Moved them into a proper dune project with a shared helpers
library and a runner, so this year starts on the right foot.`,
    author: "theo",
    daysAgo: 362,
  },
  history: [
    {
      label: "tests",
      message: `Add the puzzle examples as tests

dune test runs every worked example from the descriptions. Day 3 has no
test because its example is a picture and I'm not typing it in.`,
      author: "theo",
      daysAgo: 355,
      changes: {
        "test/dune": testDune,
        "test/test_examples.ml": testExamples,
      },
    },
    {
      label: "ocamlformat",
      message: "Add .ocamlformat",
      author: "theo",
      daysAgo: 340,
      changes: {
        ".ocamlformat": ocamlformat,
      },
    },
    {
      label: "bench",
      message: `Add a bench executable

Runs every solved day against its input and prints the median of 15 runs.
Mostly so I can stop arguing with Tomas about whose day 2 is faster
using numbers from different laptops.`,
      author: "theo",
      daysAgo: 330,
      changes: {
        "bench/dune": benchDune,
        "bench/bench.ml": benchMl,
        "README.md": [
          [
            "- bin: the runner\n",
            "- bin: the runner\n- bench: times every day, `dune exec --profile release bench/bench.exe`\n",
          ],
        ],
      },
    },
    {
      label: "d01",
      message: `2025 day 1: lantern wicks

Unlocked at 06:00, both stars at 06:09. Priya was faster. Priya is always
faster.`,
      author: "theo",
      daysAgo: 323,
      changes: {
        "lib/y2025/dune": y2025Dune,
        "lib/y2025/day01.ml": y2025Day01,
        "lib/all/dune": [["(libraries y2024)", "(libraries y2024 y2025)"]],
        "lib/all/all.ml": [
          ["    ((2024, 4), Y2024.Day04.solve);\n", "    ((2024, 4), Y2024.Day04.solve);\n    ((2025, 1), Y2025.Day01.solve);\n"],
        ],
      },
    },
    {
      label: "alt-priya-d01",
      message: `alt: priya's day 1, one fold

Theo asked me to "send the fast one", so here it is.`,
      author: "priya",
      daysAgo: 323,
      changes: {
        "alt/README.md": altReadme,
        "alt/priya/day01.ml": priyaDay01,
      },
    },
    {
      label: "d02",
      message: `2025 day 2: frost on the window

Part 2 takes over two seconds because it compares against every earlier
grid. It works, it's 6am, I'm going back to bed.`,
      author: "theo",
      daysAgo: 322,
      changes: {
        "lib/y2025/day02.ml": y2025Day02,
        "lib/all/all.ml": [
          ["    ((2025, 1), Y2025.Day01.solve);\n", "    ((2025, 1), Y2025.Day01.solve);\n    ((2025, 2), Y2025.Day02.solve);\n"],
        ],
      },
    },
    {
      label: "d03",
      message: "2025 day 3: ribbon",
      author: "theo",
      daysAgo: 321,
      changes: {
        "lib/y2025/day03.ml": y2025Day03,
        "lib/all/all.ml": [
          ["    ((2025, 2), Y2025.Day02.solve);\n", "    ((2025, 2), Y2025.Day02.solve);\n    ((2025, 3), Y2025.Day03.solve);\n"],
        ],
      },
    },
    {
      label: "ints-plus",
      message: `aoc: ints accepts a leading +

Inputs with "+3" were being read as 3 by accident (the regexp skipped the
plus), which is right, but "x+3" came out as 3 too. Making it explicit.`,
      author: "yuki",
      daysAgo: 321,
      changes: {
        "lib/aoc/aoc.ml": [
          ['let int_re = Str.regexp "-?[0-9]+"', 'let int_re = Str.regexp "[-+]?[0-9]+"'],
          [
            '(* Every integer in a string, in order: "x=3, y=-12" gives [3; -12]. *)',
            '(* Every integer in a string, in order: "x=3, y=-12, z=+4" gives [3; -12; 4]. *)',
          ],
        ],
      },
    },
    {
      label: "d04",
      message: `2025 day 4: choir seating

Topological sort with alphabetical tie-breaking, and a memoised longest
path for part 2. No cycle detection; the puzzle promises there are none.`,
      author: "theo",
      daysAgo: 320,
      changes: {
        "lib/y2025/day04.ml": y2025Day04,
        "lib/all/all.ml": [
          ["    ((2025, 3), Y2025.Day03.solve);\n", "    ((2025, 3), Y2025.Day03.solve);\n    ((2025, 4), Y2025.Day04.solve);\n"],
        ],
      },
    },
    {
      label: "d05",
      message: `2025 day 5: cocoa tins

Subset counting for part 1, unbounded coin change for part 2. Felt like an
exam question.`,
      author: "theo",
      daysAgo: 319,
      changes: {
        "lib/y2025/day05.ml": y2025Day05,
        "lib/all/all.ml": [
          ["    ((2025, 4), Y2025.Day04.solve);\n", "    ((2025, 4), Y2025.Day04.solve);\n    ((2025, 5), Y2025.Day05.solve);\n"],
        ],
      },
    },
    {
      label: "frost-fast",
      message: `day 2: remember seen grids in a Hashtbl

first_repeat compared each new grid against every earlier one, so part 2
was quadratic in the number of minutes. Keying a Hashtbl on the grid's
contents makes each check constant time: 2.3 s down to 41 ms on my input.`,
      author: "tomas",
      daysAgo: 318,
      changes: {
        "lib/y2025/day02.ml": [[firstRepeatList, firstRepeatHashtbl]],
      },
    },
    {
      label: "d06",
      message: `2025 day 6: snowplow

BFS over (position, drifts broken). Part 2 is the same search with one
break allowed.`,
      author: "theo",
      daysAgo: 318,
      changes: {
        "lib/y2025/day06.ml": y2025Day06,
        "lib/all/all.ml": [
          ["    ((2025, 5), Y2025.Day05.solve);\n", "    ((2025, 5), Y2025.Day05.solve);\n    ((2025, 6), Y2025.Day06.solve);\n"],
        ],
      },
    },
    {
      label: "d07",
      message: `2025 day 7: sleigh bells

Chinese remainder by sieving. Part 1 is a red herring, it's just the lcm.`,
      author: "theo",
      daysAgo: 317,
      changes: {
        "lib/y2025/day07.ml": y2025Day07,
        "lib/all/all.ml": [
          ["    ((2025, 6), Y2025.Day06.solve);\n", "    ((2025, 6), Y2025.Day06.solve);\n    ((2025, 7), Y2025.Day07.solve);\n"],
        ],
      },
    },
    {
      label: "alt-malik-d06",
      message: `alt: malik's day 6 as a 0-1 BFS

Solves a slightly different problem (fewest drifts rather than fewest
moves) because I misread it at 6am. Keeping it because I like it.`,
      author: "malik",
      daysAgo: 316,
      changes: {
        "alt/malik/day06.ml": malikDay06,
      },
    },
    {
      label: "d07-offsets",
      message: `day 7: offsets can be bigger than the period

"5 @ 12" means the bell first rings at minute 12, and t mod 5 is never 12,
so the sieve looped forever on Malik's input. Reduce the offset first.`,
      author: "theo",
      daysAgo: 315,
      changes: {
        "lib/y2025/day07.ml": [
          [
            "    (fun (t, step) (p, o) ->\n      let t = ref t in\n",
            "    (fun (t, step) (p, o) ->\n      let o = o mod p in\n      let t = ref t in\n",
          ],
        ],
      },
    },
    {
      label: "y2025-done",
      message: `README: 2025 scoreboard

Seven days, fourteen stars, then the office party and a cold happened.
Writing down how it went before I forget.`,
      author: "theo",
      daysAgo: 312,
      changes: {
        "README.md": [
          [
            "No dependencies beyond the standard library, str and unix. That's a rule.\n",
            `No dependencies beyond the standard library, str and unix. That's a rule.

## 2025

| Day | Puzzle | Stars | Notes |
|---|---|---|---|
| 1 | Lantern wicks | ★★ | Priya won by 3 minutes |
| 2 | Frost on the window | ★★ | Tomas made part 2 50x faster the same day |
| 3 | Ribbon | ★★ | |
| 4 | Choir seating | ★★ | |
| 5 | Cocoa tins | ★★ | Priya did part 1 without DP out of spite |
| 6 | Snowplow | ★★ | |
| 7 | Sleigh bells | ★★ | Looped forever on Malik's input, fixed |

Stopped after day 7. Next year, all 25. (I said that last year.)
`,
          ],
        ],
      },
    },
    {
      label: "bench-total",
      message: `bench: print a total at the end

Handy for the "whole year under 100 ms" bragging rights.`,
      author: "zeynep",
      daysAgo: 290,
      changes: {
        "bench/bench.ml": [
          ["let () =\n  List.iter\n", "let () =\n  let total = ref 0. in\n  List.iter\n"],
          [
            String.raw`        Printf.printf "%d day %02d %10.2f ms\n%!" year day ms
`,
            String.raw`        total := !total +. ms;
        Printf.printf "%d day %02d %10.2f ms\n%!" year day ms
`,
          ],
          [
            "    All.solutions\n",
            String.raw`    All.solutions;
  Printf.printf "total       %10.2f ms\n" !total
`,
          ],
        ],
      },
    },
    {
      label: "grid-find",
      message: `aoc: add Grid.find, use it in day 6

Every grid puzzle with a start and an end needs this, and the version in
day 6 picked the last match instead of the first.`,
      author: "theo",
      daysAgo: 240,
      changes: {
        "lib/aoc/aoc.ml": [
          [
            "    !acc\nend\n",
            String.raw`    !acc

  (* The first cell holding [ch], scanning row by row. *)
  let find g ch =
    match fold (fun acc p c -> if acc = None && c = ch then Some p else acc) None g with
    | Some p -> p
    | None -> invalid_arg (Printf.sprintf "Grid.find: no %C in grid" ch)
end
`,
          ],
        ],
        "lib/y2025/day06.ml": [
          [
            "let find g ch =\n  Grid.fold (fun acc p c -> if c = ch then Some p else acc) None g |> Option.get\n\n",
            "",
          ],
          ["let start = find g 'S' and goal = find g 'E' in", "let start = Grid.find g 'S' and goal = Grid.find g 'E' in"],
        ],
      },
    },
    {
      label: "alt-priya-d05",
      message: `alt: priya's day 5, no DP

Six months late, but I said I'd prove it.`,
      author: "priya",
      daysAgo: 205,
      changes: {
        "alt/priya/day05.ml": priyaDay05,
      },
    },
    {
      label: "dune-3.16",
      message: "Bump dune lang to 3.16",
      author: "theo",
      daysAgo: 175,
      changes: {
        "dune-project": duneProject316,
      },
    },
    {
      label: "d03-fix",
      message: `day 3: merge touching ranges, fix the gap length

Ranges include both ends, so 5-7 and 8-9 leave no unused ribbon between
them and should merge, and the gap between 5-7 and 10-12 is 2 (8 and 9),
not 3. Theo's input happened to give the right answer anyway; Priya's
didn't.`,
      author: "self",
      daysAgo: 120,
      changes: {
        "lib/y2025/day03.ml": [
          ["when lo <= phi ->", "when lo <= phi + 1 ->"],
          [
            "  | (_, hi) :: ((lo, _) :: _ as rest) -> (lo - hi) :: gaps rest\n",
            "  | (_, hi) :: ((lo, _) :: _ as rest) -> (lo - hi - 1) :: gaps rest\n",
          ],
        ],
      },
    },
    {
      label: "tests-2025",
      message: `test: add the 2025 examples

Would have caught the day 3 off-by-one.`,
      author: "zeynep",
      daysAgo: 95,
      changes: {
        "test/dune": [["(libraries y2024))", "(libraries y2024 y2025))"]],
        "test/test_examples.ml": [
          [
            String.raw`  both "2024/04" ("3", "1") (Y2024.Day04.solve "N2,E2,S1,W4\n");
`,
            String.raw`  both "2024/04" ("3", "1") (Y2024.Day04.solve "N2,E2,S1,W4\n");
  both "2025/01" ("3", "51") (Y2025.Day01.solve "12\n18\n19\n21\n");
  both "2025/03" ("17", "1") (Y2025.Day03.solve "3-5\n10-14\n6-8\n16-20\n12-18\n");
  both "2025/04" ("Ada,Bram,Cy,Dee", "3")
    (Y2025.Day04.solve "Ada before Cy\nBram before Cy\nCy before Dee\n");
  both "2025/05" ("4", "2") (Y2025.Day05.solve "25\n20\n15\n10\n5\n5\n");
  both "2025/07" ("105", "23") (Y2025.Day07.solve "3 @ 2\n5 @ 3\n7 @ 2\n");
`,
          ],
        ],
      },
    },
    {
      label: "bench-year",
      message: `bench: optional year argument

bench/bench.exe 2025 times only that year.`,
      author: "theo",
      daysAgo: 70,
      changes: {
        "bench/bench.ml": [
          [
            "let () =\n",
            "let year = if Array.length Sys.argv > 1 then Some (int_of_string Sys.argv.(1)) else None\n\nlet () =\n",
          ],
          [
            "    All.solutions;\n",
            "    (List.filter (fun ((y, _), _) -> Option.fold ~none:true ~some:(( = ) y) year) All.solutions);\n",
          ],
        ],
      },
    },
    {
      label: "fetch",
      message: `Add scripts/fetch-input

Downloads a day's input with the session cookie from .session, so I stop
copy-pasting from the browser at 6am.`,
      author: "theo",
      daysAgo: 45,
      changes: {
        "scripts/fetch-input": fetchInput,
      },
    },
    {
      label: "fetch-cookie",
      message: `fetch-input: keep the session cookie out of argv

Anything on curl's command line shows up in ps for every user on the
machine. Pass the header through a config on stdin instead.`,
      author: "tomas",
      daysAgo: 30,
      changes: {
        "scripts/fetch-input": [
          [
            String.raw`curl -fsS -A "theo's input fetcher (theo@example.org)" \
  -H "Cookie: session=$(cat .session)" \
  -o "$out" \
`,
            String.raw`printf 'header = "Cookie: session=%s"\n' "$(cat .session)" |
  curl -fsS -K - -A "theo's input fetcher (theo@example.org)" \
  -o "$out" \
`,
          ],
        ],
      },
    },
    {
      label: "new-day",
      message: `Prepare for 2026: day template and new-day script

scripts/new-day 2026 1 creates lib/y2026 if needed, copies the template
and fetches the input. Forty days to go.`,
      author: "theo",
      daysAgo: 18,
      changes: {
        "scripts/new-day": newDay,
        "template/day.ml": templateDay,
      },
    },
    {
      label: "new-day-register",
      message: `new-day: register the day in lib/all too

Forgot this every single day last year.`,
      author: "theo",
      daysAgo: 10,
      changes: {
        "scripts/new-day": [
          [
            'echo "created $file"\n',
            String.raw`entry="    (($year, $2), Y$year.Day$day.solve);"
if ! grep -qF "$entry" lib/all/all.ml; then
  sed -i.bak "s|^  \]$|$entry\n  ]|" lib/all/all.ml && rm -f lib/all/all.ml.bak
fi
grep -q "y$year" lib/all/dune || echo "remember to add y$year to lib/all/dune" >&2
echo "created $file"
`,
          ],
        ],
      },
    },
    {
      label: "readme-leaderboard",
      message: "README: mention the private leaderboard",
      author: "yuki",
      daysAgo: 4,
      changes: {
        "README.md": [
          [
            "## 2025\n",
            "Racing? Our private leaderboard code is pinned in the group chat. Ask\nTheo if you're not in it.\n\n## 2025\n",
          ],
        ],
      },
    },
    {
      label: "grid-print",
      message: `aoc: add Grid.print for debugging

Printing grids by hand was the slowest part of day 2 last year.`,
      author: "theo",
      daysAgo: 1,
      changes: {
        "lib/aoc/aoc.ml": [
          [
            String.raw`    | None -> invalid_arg (Printf.sprintf "Grid.find: no %C in grid" ch)
end
`,
            String.raw`    | None -> invalid_arg (Printf.sprintf "Grid.find: no %C in grid" ch)

  let print (g : t) =
    Array.iter (fun row -> Array.iter print_char row; print_newline ()) g
end
`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "How do I run the tests without the inputs?",
      author: "yuki",
      daysAgo: 336,
      body: "Cloned it to compare against my Rust versions, but `dune exec aoc -- 2024 1` just says the file doesn't exist. Is there a way to check things work without your input?",
      labels: ["question"],
      state: "solved",
      closedHoursAfter: 5,
      comments: [
        {
          author: "theo",
          body: "`dune test` runs the worked examples from the puzzle descriptions, no inputs needed. For real answers you'll need your own inputs from the site, they're different per person.",
          hoursAfter: 2,
        },
        {
          author: "yuki",
          body: "Oh nice, that's exactly what I wanted. Thanks!",
          hoursAfter: 5,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Day 2 part 2 takes over two seconds",
      author: "tomas",
      daysAgo: 322,
      body: "On my input `first_repeat` takes 2.3 s. It's comparing each new grid with every grid before it, structurally. Happy to send a patch, but you might want the glory.",
      labels: ["performance"],
      state: "solved",
      closedHoursAfter: 40,
      comments: [
        {
          author: "theo",
          body: "I knew someone would say something. Send it, I need to sleep.",
          hoursAfter: 1,
          reactions: [{ emoji: "😴", by: ["tomas", "priya"] }],
        },
        {
          author: "priya",
          body: "Mine runs in 30 ms, just saying.",
          hoursAfter: 2,
          reactions: [{ emoji: "😤", by: ["theo"] }],
        },
        {
          author: "theo",
          body: "Merged Tomas's patch, 41 ms now. Priya, nobody asked.",
          hoursAfter: 40,
          reactions: [{ emoji: "😂", by: ["priya", "tomas", "malik"] }],
        },
      ],
    },
    {
      title: "Day 4 loops forever if the rules have a cycle",
      author: "zeynep",
      daysAgo: 319,
      body: "Not a problem with the real input, but I fed it a handmade one with `A before B` and `B before A` and `S.min_elt` raised Not_found. Might be worth a friendlier error?",
      labels: ["bug"],
      state: "closed",
      closedHoursAfter: 6,
      comments: [
        {
          author: "theo",
          body: "The puzzle promises there are no cycles, and I'm not writing defensive code at 6am for inputs that can't exist. Closing, but you're right in principle.",
          hoursAfter: 6,
        },
        {
          author: "zeynep",
          body: "Fair. It's a puzzle repo, not a choir management system.",
          hoursAfter: 8,
          replyTo: 0,
          reactions: [{ emoji: "😄", by: ["theo"] }],
        },
      ],
    },
    {
      title: "Day 7 never finishes on my input",
      author: "malik",
      daysAgo: 316,
      body: "Left it running for ten minutes, nothing. My input has bells like `5 @ 12`, where the first ring is later than the period. Is that allowed?",
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 20,
      comments: [
        {
          author: "theo",
          body: "Yes, and that's exactly the bug: `t mod 5` can never be 12. Mine never had a first ring past the period. Fixing.",
          hoursAfter: 3,
        },
        {
          author: "malik",
          body: "Works now, 0.2 ms. Also, for the record, js_of_ocaml overflows on part 2 because ints are 32-bit there, but I'm not filing that one.",
          hoursAfter: 20,
          reactions: [{ emoji: "🙈", by: ["theo"] }],
        },
      ],
    },
    {
      title: "bench numbers jump around between runs",
      author: "zeynep",
      daysAgo: 285,
      body: "Running `bench.exe` twice in a row on my laptop, day 6 goes from 3.1 ms to 5.8 ms. Is 15 runs enough? Or is something else going on?",
      labels: ["question", "bench"],
      comments: [
        {
          author: "theo",
          body: "Probably CPU frequency scaling. Is your laptop on battery? Mine is steadier plugged in with the performance governor.",
          hoursAfter: 9,
        },
        {
          author: "zeynep",
          body: "It was on battery, yes. Plugged in it's within 5%.",
          hoursAfter: 20,
          replyTo: 0,
        },
        {
          author: "tomas",
          body: "Also, the GC. Calling Gc.compact () before each timed run made mine much steadier.",
          hoursAfter: 26,
          reactions: [{ emoji: "👀", by: ["theo", "zeynep"] }],
        },
        {
          author: "theo",
          body: "Leaving this open as a reminder to try the Gc.compact thing.",
          hoursAfter: 30,
          replyTo: 2,
        },
      ],
    },
    {
      title: "Day 3 part 2 is one too high on my input",
      author: "priya",
      daysAgo: 126,
      body: "Doing a summer rerun of 2025 with Theo's code to check my answers. Day 3 part 2 gives 48, the site says the answer is 47. I think the gap counts one of the end points?",
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 150,
      comments: [
        {
          author: "self",
          body: "Yes: ranges include both ends, so the gap between 5-7 and 10-12 is 2 (8 and 9), but `lo - hi` gives 3. Touching ranges like 5-7 and 8-9 also don't get merged. I'll send a fix.",
          hoursAfter: 20,
          reactions: [{ emoji: "🙏", by: ["priya", "theo"] }],
        },
        {
          author: "theo",
          body: "How did that ever get a star. Oh, my input just happened to have its biggest gap next to a touching pair. Lucky.",
          hoursAfter: 26,
          replyTo: 0,
        },
        {
          author: "priya",
          body: "47 now. Thanks!",
          hoursAfter: 150,
        },
      ],
    },
    {
      title: "Try OCaml 5 domains in the bench?",
      author: "self",
      daysAgo: 62,
      body: "The days are completely independent, so the bench could run them in parallel on a Domain pool and finish the whole year in a fraction of the time. Not useful for timing individual days, but nice for a quick \"does everything still work\" run.",
      labels: ["enhancement", "bench"],
      comments: [
        {
          author: "theo",
          body: "I'm into it, as long as the per-day numbers stay sequential. Parallel timing would just measure the scheduler.",
          hoursAfter: 12,
        },
        {
          author: "priya",
          body: "I have a draft that adds a `--all` mode with Domains. Will push it once I've figured out why it's slower on my machine.",
          hoursAfter: 40,
          reactions: [{ emoji: "😂", by: ["self", "theo"] }],
        },
      ],
    },
    {
      title: "fetch-input puts the session cookie in the process list",
      author: "tomas",
      daysAgo: 33,
      body: "`curl -H \"Cookie: session=...\"` means anyone on the machine can see your session in `ps aux` while it runs. On a laptop it doesn't matter, but you mentioned running this on the shared box at work.",
      labels: ["security", "scripts"],
      state: "solved",
      closedHoursAfter: 72,
      comments: [
        {
          author: "theo",
          body: "Oof, good catch. Do you know the neat way round it with curl?",
          hoursAfter: 4,
        },
        {
          author: "tomas",
          body: "`curl -K -` reads options from stdin, so you can printf the header into it. Patch incoming.",
          hoursAfter: 6,
          replyTo: 0,
          reactions: [{ emoji: "👍", by: ["theo", "malik"] }],
        },
      ],
    },
    {
      title: "Rules for the 2026 race",
      author: "malik",
      daysAgo: 14,
      body: "Forty-odd days to go. Last year there were arguments about what counts. Proposal:\n\n1. Time is from unlock to your second star, by the site's clock.\n2. Any language, but you have to commit your solution here (or to `alt/`) the same day.\n3. No AI assistants. Search engines and docs are fine.\n4. Loser of the most days buys the January pizza.",
      labels: ["discussion"],
      comments: [
        {
          author: "theo",
          body: "Agree with all of it. Can we add a handicap for people who live in a timezone where unlock is at a civilised hour? Looking at you, Priya.",
          hoursAfter: 2,
          reactions: [{ emoji: "😂", by: ["malik", "zeynep"] }],
        },
        {
          author: "priya",
          body: "Unlock is 11:30 for me, in the middle of my working day. If anything I'm the one with the handicap.",
          hoursAfter: 4,
          replyTo: 0,
        },
        {
          author: "zeynep",
          body: "For 3: does editor autocomplete count? Asking for a friend who relies heavily on merlin.",
          hoursAfter: 9,
        },
        {
          author: "malik",
          body: "Merlin is fine, it's not writing your algorithm for you.",
          hoursAfter: 10,
          replyTo: 2,
          reactions: [{ emoji: "👍", by: ["zeynep", "tomas"] }],
        },
        {
          author: "tomas",
          body: "Rule 2 is the important one. Theo's day 8 from last year is still \"on the way\".",
          hoursAfter: 22,
          reactions: [{ emoji: "💀", by: ["malik", "priya", "yuki"] }],
        },
        {
          author: "self",
          body: "I'm in. Can I race in OCaml as a total beginner and get a sympathy multiplier?",
          hoursAfter: 30,
        },
        {
          author: "theo",
          body: "Sympathy granted. And yes, I'll merge Malik's day 8 before December, stop it.",
          hoursAfter: 33,
          replyTo: 5,
          reactions: [{ emoji: "❤️", by: ["self"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "day 2: remember seen grids in a Hashtbl",
      author: "tomas",
      daysAgo: 320,
      labels: ["performance"],
      state: "merged",
      revisions: [
        {
          description:
            "Replaces the list of earlier grids in `first_repeat` with a Hashtbl, so each check is constant time instead of a scan. 2.3 s down to 9 ms on my input.",
          hoursAfter: 0,
          commits: [
            {
              message: `day 2: hash seen grids

Store a hash of each grid instead of the grid itself.`,
              author: "tomas",
              daysAgo: 320,
              changes: {
                "lib/y2025/day02.ml": [[firstRepeatList, firstRepeatHash]],
              },
            },
          ],
          reviews: [
            {
              author: "theo",
              hoursAfter: 6,
              verdict: "reject",
              summary: "Fast, but I'm not sure it's right.",
              comments: [
                {
                  body: "Hashtbl.hash only looks at a limited number of elements of a structure (10 meaningful, 256 total), and for a char array array most of those are the first few rows. Two grids that differ further down will collide, and this returns the minute of a false repeat. Can we key on the full contents?",
                  path: "lib/y2025/day02.ml",
                  line: 33,
                },
              ],
            },
          ],
          comments: [
            {
              author: "tomas",
              body: "Ugh, you're right, I just checked and two of my grids from minute 40 and 61 hash the same. The 9 ms was too good to be true.",
              hoursAfter: 9,
            },
          ],
        },
        {
          description:
            "Keys the table on the whole grid as a string instead. Slower than the hash version but correct: 41 ms on my input.",
          hoursAfter: 30,
          fromHistory: ["frost-fast"],
          reviews: [
            {
              author: "theo",
              hoursAfter: 34,
              verdict: "accept",
              summary: "Correct and 50x faster. Merged, thanks Tomas.",
              comments: [
                {
                  body: "Building a string per minute is a bit wasteful, but at 41 ms I'm not going to argue.",
                  path: "lib/y2025/day02.ml",
                  line: 30,
                  endLine: 31,
                  resolved: true,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "2025 day 8: secret gift exchange",
      author: "malik",
      daysAgo: 40,
      labels: ["solution"],
      state: "open",
      revisions: [
        {
          description:
            "Theo never did day 8, so here's mine, in his style so it fits. Counting cycles in a permutation; each person is visited once.",
          hoursAfter: 0,
          commits: [
            {
              message: `2025 day 8: secret gift exchange

Walk each unvisited person's chain until it comes back round.`,
              author: "malik",
              daysAgo: 40,
              changes: {
                "lib/y2025/day08.ml": y2025Day08,
                "lib/all/all.ml": [
                  ["    ((2025, 7), Y2025.Day07.solve);\n", "    ((2025, 7), Y2025.Day07.solve);\n    ((2025, 8), Y2025.Day08.solve);\n"],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "theo",
              hoursAfter: 30,
              summary:
                "Looks right to me and it's nicer than what I'd have written. A couple of small things.",
              comments: [
                {
                  body: "If the input is pasted wrong and someone doesn't give a present, this raises a bare Not_found from deep in the fold. A failwith naming the person would save someone ten minutes.",
                  path: "lib/y2025/day08.ml",
                  line: 26,
                },
                {
                  body: "Not a problem, just noting: mutating `seen` while folding over `gives` is fine because they're different tables. Took me a second.",
                  path: "lib/y2025/day08.ml",
                  line: 18,
                },
              ],
            },
          ],
          comments: [
            {
              author: "malik",
              body: "Will fix the Not_found. Can you merge before December? Tomas keeps bringing it up.",
              hoursAfter: 36,
            },
            {
              author: "theo",
              body: "Will do. Honestly I'm tempted to leave it open a bit longer just to annoy Tomas.",
              hoursAfter: 40,
              replyTo: 0,
              reactions: [{ emoji: "😂", by: ["malik"] }],
            },
          ],
        },
      ],
    },
    {
      title: "day 6: A* instead of BFS",
      author: "self",
      daysAgo: 13,
      labels: ["performance"],
      state: "open",
      revisions: [
        {
          description:
            "Learning OCaml by poking at old days. This swaps the BFS in the snowplow for A* with a Manhattan-distance estimate, using a Set as the priority queue since the stdlib doesn't have one.",
          hoursAfter: 0,
          commits: [
            {
              message: `day 6: use A* with a Manhattan estimate

A Set of (estimate, state) stands in for a priority queue.`,
              author: "self",
              daysAgo: 13,
              changes: {
                "lib/y2025/day06.ml": y2025Day06AStar,
              },
            },
          ],
          reviews: [
            {
              author: "theo",
              hoursAfter: 14,
              summary:
                "Really nice for a first OCaml patch! But bench says it's 4.4 ms vs 3.8 ms for the BFS on my input, so it's a bit slower. Every move costs the same, so BFS already expands in order of distance, and the Set costs more than a Queue. A* would win on a big open map where the estimate prunes a lot.",
              comments: [
                {
                  body: "Using the whole tuple as the Set element is a neat trick: two states with the same estimate don't overwrite each other because the state is part of the key.",
                  path: "lib/y2025/day06.ml",
                  line: 11,
                },
                {
                  body: "When `better` is true for a state that's already in the frontier, the old, worse entry stays in the Set and gets popped later. It's harmless because `d` is looked up from `dist`, but it's worth a comment.",
                  path: "lib/y2025/day06.ml",
                  line: 42,
                  endLine: 44,
                },
              ],
            },
          ],
          comments: [
            {
              author: "self",
              body: "Ha, slower is not what I was going for. Happy to close it, or keep it as an alt/ version if that's more fun?",
              hoursAfter: 18,
            },
            {
              author: "malik",
              body: "alt/ please, then my 0-1 BFS has company.",
              hoursAfter: 21,
              replyTo: 0,
              reactions: [{ emoji: "👍", by: ["self", "theo"] }],
            },
          ],
        },
      ],
    },
    {
      title: "bench: run all days in parallel with Domains",
      author: "priya",
      daysAgo: 38,
      labels: ["bench"],
      state: "draft",
      revisions: [
        {
          description:
            "WIP for the domains issue. Adds `--all`, which runs every day once on a pool of domains and prints pass/fail, for a quick smoke test. Currently slower than sequential on my laptop and I don't know why yet.",
          hoursAfter: 0,
          commits: [
            {
              message: "bench: --all runs every day once across domains",
              author: "priya",
              daysAgo: 38,
              changes: {
                "bench/bench.ml": [
                  [
                    "let () =\n",
                    String.raw`let smoke () =
  let jobs =
    List.filter_map
      (fun ((year, day), solve) ->
        let path = Printf.sprintf "inputs/%d/day%02d.txt" year day in
        if Sys.file_exists path then Some ((year, day), solve, Aoc.read_file path) else None)
      All.solutions
  in
  let t0 = Unix.gettimeofday () in
  let domains =
    List.map (fun (key, solve, input) -> (key, Domain.spawn (fun () -> solve input))) jobs
  in
  List.iter
    (fun ((year, day), d) ->
      let p1, p2 = Domain.join d in
      Printf.printf "%d day %02d  %s / %s\n" year day p1 p2)
    domains;
  Printf.printf "all days in %.1f ms\n" ((Unix.gettimeofday () -. t0) *. 1000.)

let () =
  if Array.mem "--all" Sys.argv then (smoke (); exit 0);
`,
                  ],
                ],
              },
            },
          ],
          comments: [
            {
              author: "tomas",
              body: "You're spawning one domain per day, and domains are heavy (each is an OS thread with its own minor heap). With 13 days on a 4-core laptop they fight each other. Domainslib's pool would fix it, but that's a dependency.",
              hoursAfter: 10,
            },
            {
              author: "priya",
              body: "That explains it. I'll write a tiny pool by hand with Domain.recommended_domain_count () workers pulling from an Atomic counter, no deps.",
              hoursAfter: 14,
              replyTo: 0,
              reactions: [{ emoji: "🚀", by: ["self", "tomas"] }],
            },
          ],
        },
      ],
    },
    {
      title: "Use cmdliner for the runner",
      author: "zeynep",
      daysAgo: 150,
      labels: ["runner"],
      state: "archived",
      revisions: [
        {
          description:
            "Replaces the hand-rolled argument parsing in bin/main.ml with cmdliner, which gives `--help`, proper errors for bad numbers, and a `--input` flag.",
          hoursAfter: 0,
          commits: [
            {
              message: "bin: parse arguments with cmdliner",
              author: "zeynep",
              daysAgo: 150,
              changes: {
                "bin/dune": [["(libraries aoc all unix)", "(libraries aoc all unix cmdliner)"]],
                "bin/main.ml": String.raw`open Cmdliner

let run year day input =
  let path = Option.value input ~default:(Printf.sprintf "inputs/%d/day%02d.txt" year day) in
  match All.find year day with
  | None -> Error (Printf.sprintf "no solution for %d day %d yet" year day)
  | Some solve ->
      let p1, p2 = solve (Aoc.read_file path) in
      Printf.printf "part 1: %s\npart 2: %s\n" p1 p2;
      Ok ()

let year = Arg.(required & pos 0 (some int) None & info [] ~docv:"YEAR")
let day = Arg.(required & pos 1 (some int) None & info [] ~docv:"DAY")
let input = Arg.(value & opt (some file) None & info [ "i"; "input" ] ~docv:"FILE")

let () =
  let info = Cmd.info "aoc" ~doc:"Run a puzzle solution" in
  exit (Cmd.eval (Cmd.v info Term.(term_result' (const run $ year $ day $ input))))
`,
              },
            },
          ],
          comments: [
            {
              author: "theo",
              body: "This is tidy, and cmdliner is lovely, but the README says no dependencies beyond the stdlib, str and unix, and I'd like to keep it that way: part of the fun is that a fresh opam switch with just dune can build it. Archiving, sorry!",
              hoursAfter: 16,
            },
            {
              author: "zeynep",
              body: "I did read the README, I was hoping you'd make an exception. No worries.",
              hoursAfter: 20,
              replyTo: 0,
              reactions: [{ emoji: "😄", by: ["theo"] }],
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "2025",
      at: "y2025-done",
      title: "December 2025: fourteen stars",
      notes: `Days 1 to 7 of 2025, both parts, plus the four days of 2024 ported to dune.

- Fastest day: 1 (0.08 ms). Slowest: 2 (41 ms, after Tomas's fix)
- Thanks to Tomas for the day 2 speedup, Malik for finding the day 7 hang,
  and Priya for winning every morning and being insufferable about it`,
      author: "theo",
      daysAgo: 312,
    },
  ],
};
